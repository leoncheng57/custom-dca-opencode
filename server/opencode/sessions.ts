// server/opencode/sessions.ts
//
// Session operations against the OpenCode server. Thin, but every function
// here encodes at least one thing that is easy to get wrong:
//
//   - prompt() uses /prompt_async, never /message. The latter holds the HTTP
//     response open for the ENTIRE agent turn, which looks like a hang from a
//     UI and dies the moment a client disconnects.
//   - Every call is directory-scoped. One OpenCode server hosts every project;
//     omitting ?directory= silently targets whichever directory the server was
//     started in.
//   - status() only reports sessions owned by the current server process,
//     which is exactly what makes crash detection possible (detectInterrupted).

import { withReminderTag, type ReminderPreset } from "../reminders/reminders.js";
import { request, requestWithResponse, type OpencodeConfig } from "./client.js";

export type AgentMode = "plan" | "build";

export interface ModelSelection {
  providerID: string;
  modelID: string;
  variant?: string;
}

const PLAN_TOOL_ALLOWLIST = new Set([
  "read",
  "glob",
  "grep",
  "webfetch",
  "websearch",
  "question",
  "task",
  "todowrite",
  "skill",
]);

type PermissionAction = "allow" | "ask" | "deny";

interface PermissionRule {
  permission: string;
  pattern: string;
  action: PermissionAction;
}

type PermissionRuleset = PermissionRule[];

interface RawAgent {
  name?: string;
  permission?: PermissionRuleset;
}

interface RawMessage {
  info?: { role?: string; agent?: string };
}

const EDIT_TOOL_ALIASES = new Set(["edit", "write", "apply_patch"]);
const sessionPromptTails = new Map<string, Promise<void>>();

export class ModePolicyActivationError extends Error {
  constructor(mode: AgentMode) {
    super(`Could not activate OpenCode ${mode === "plan" ? "Plan" : "Build"} policy; prompt was not sent`);
    this.name = "ModePolicyActivationError";
  }
}

export type SessionAgentIdentityErrorCode = "SESSION_AGENT_UNKNOWN" | "SESSION_AGENT_UNSUPPORTED";

export class SessionAgentIdentityError extends Error {
  constructor(
    readonly code: SessionAgentIdentityErrorCode,
    readonly agent?: string,
  ) {
    super(agent
      ? `This session uses OpenCode agent "${agent}". The web UI can only prompt Plan or Build sessions; continue it in the TUI or create a web session.`
      : "This session's OpenCode agent could not be established. Continue it in the TUI or create a web Plan or Build session.");
    this.name = "SessionAgentIdentityError";
  }
}

function validRuleset(value: unknown): value is PermissionRuleset {
  return Array.isArray(value) && value.every((rule) => {
    if (!rule || typeof rule !== "object") return false;
    const source = rule as Partial<PermissionRule>;
    return typeof source.permission === "string"
      && typeof source.pattern === "string"
      && (source.action === "allow" || source.action === "ask" || source.action === "deny");
  });
}

function rulesEndWith(rules: PermissionRuleset, suffix: PermissionRuleset): boolean {
  if (suffix.length === 0 || suffix.length > rules.length) return false;
  return suffix.every((rule, index) => {
    const existing = rules[rules.length - suffix.length + index];
    return existing.permission === rule.permission
      && existing.pattern === rule.pattern
      && existing.action === rule.action;
  });
}

function permissionNames(tool: string): Set<string> {
  return EDIT_TOOL_ALIASES.has(tool) ? new Set(["*", "edit", tool]) : new Set(["*", tool]);
}

function buildRulesForTools(agentRules: PermissionRuleset, toolIDs: string[]): PermissionRuleset {
  return toolIDs.flatMap((tool) => {
    const names = permissionNames(tool);
    return agentRules
      .filter((rule) => names.has(rule.permission))
      .map((rule) => ({ ...rule, permission: tool }));
  });
}

function hasPlanDenial(rules: PermissionRuleset, toolIDs: string[]): boolean {
  return toolIDs.some((tool) => {
    const names = permissionNames(tool);
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const rule = rules[index];
      if (rule.pattern === "*" && rule.permission !== "*" && names.has(rule.permission)) {
        return rule.action === "deny";
      }
    }
    return false;
  });
}

function assertModeAgentIdentity(session: RawSession, messages: RawMessage[]): void {
  // User messages persist the selected/session-driving agent. Assistant agents
  // include internal execution identities such as the automatic compactor.
  let messageAgent: string | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index].info;
    if (info?.role !== "user" || typeof info.agent !== "string" || !info.agent) continue;
    messageAgent = info.agent;
    break;
  }
  const agents = [session.agent, messageAgent]
    .filter((agent): agent is string => typeof agent === "string" && agent.length > 0);
  const unsupported = agents.find((agent) => agent !== "plan" && agent !== "build");
  if (unsupported) throw new SessionAgentIdentityError("SESSION_AGENT_UNSUPPORTED", unsupported);
  if (agents.length === 0) throw new SessionAgentIdentityError("SESSION_AGENT_UNKNOWN");
}

async function withSessionPromptLock<T>(
  directory: string,
  sessionID: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${directory}\0${sessionID}`;
  const previous = sessionPromptTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  sessionPromptTails.set(key, tail);

  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
    if (sessionPromptTails.get(key) === tail) sessionPromptTails.delete(key);
  }
}

export interface SessionSummary {
  id: string;
  title: string;
  directory: string;
  /** Set when this session was delegated to by another session. */
  parentID?: string;
  /**
   * Non-archived children of this session in the same directory.
   *
   * Derived by grouping the directory listing rather than by asking upstream,
   * because `/session` already returns children — 124 of 149 sessions in one
   * audited directory — so the count is free and a per-row `children` call
   * would not be.
   */
  childCount: number;
  agent?: string;
  model?: { providerID?: string; modelID?: string; variant?: string };
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  shareUrl?: string;
  /** Derived from GET /session/status. False also means "owned by nobody". */
  running: boolean;
}

interface RawSession {
  id?: string;
  title?: string;
  directory?: string;
  parentID?: string;
  agent?: string;
  model?: { providerID?: string; modelID?: string; id?: string; variant?: string };
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  permission?: PermissionRuleset;
  share?: { url?: unknown };
  time?: { created?: number; updated?: number; archived?: number };
}

export interface SessionMetadata {
  id: string;
  parentID?: string;
  title?: string;
}

/**
 * Titles are user- and model-authored, so they are capped before they reach a
 * cache or a durable notification record. A runaway title must not be able to
 * grow the history file.
 */
export const SESSION_TITLE_LIMIT = 160;

export function truncateSessionTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > SESSION_TITLE_LIMIT ? `${trimmed.slice(0, SESSION_TITLE_LIMIT - 1)}\u2026` : trimmed;
}

export function parseSessionMetadata(value: unknown): SessionMetadata | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { id?: unknown; parentID?: unknown; title?: unknown };
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (raw.parentID !== undefined && typeof raw.parentID !== "string") return null;
  const title = truncateSessionTitle(raw.title);
  return {
    id: raw.id,
    ...(raw.parentID ? { parentID: raw.parentID } : {}),
    ...(title ? { title } : {}),
  };
}

/** Fetch only the metadata needed to identify a delegated session. */
export async function getSessionMetadata(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
  signal?: AbortSignal,
): Promise<SessionMetadata | null> {
  const raw = await request<unknown>(config, `/session/${encodeURIComponent(sessionID)}`, {
    directory,
    signal,
  });
  const metadata = parseSessionMetadata(raw);
  return metadata?.id === sessionID ? metadata : null;
}

function safeShareUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

async function activateModePolicy(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
  mode: AgentMode,
): Promise<void> {
  try {
    const [toolIDs, session, agents, messages] = await Promise.all([
      request<unknown>(config, "/experimental/tool/ids", { directory }),
      request<RawSession>(config, `/session/${encodeURIComponent(sessionID)}`, { directory }),
      request<unknown>(config, "/agent", { directory }),
      request<RawMessage[]>(config, `/session/${encodeURIComponent(sessionID)}/message`, {
        directory,
        query: { limit: 100 },
      }),
    ]);
    if (session.permission !== undefined && !validRuleset(session.permission)) {
      throw new Error("invalid session permission rules");
    }
    if (!Array.isArray(messages)) throw new Error("invalid session message history");
    assertModeAgentIdentity(session, messages);
    if (!Array.isArray(toolIDs) || toolIDs.length === 0 || toolIDs.some((id) => typeof id !== "string" || !id)) {
      throw new Error("invalid tool catalogue");
    }
    if (!Array.isArray(agents)) throw new Error("invalid agent catalogue");
    const agent = (agents as RawAgent[]).find((candidate) => candidate?.name === mode);
    const agentRules = agent?.permission;
    if (!validRuleset(agentRules)) throw new Error(`missing resolved ${mode} agent policy`);

    const restrictedTools = toolIDs.filter((id): id is string => typeof id === "string" && !PLAN_TOOL_ALLOWLIST.has(id));
    if (restrictedTools.length === 0) throw new Error("tool catalogue has no restricted tools");
    const currentRules = session.permission ?? [];
    const desiredRules = mode === "plan"
      ? restrictedTools.map((permission) => ({ permission, pattern: "*", action: "deny" as const }))
      : buildRulesForTools(agentRules, toolIDs);
    if (mode === "build" && toolIDs.some((tool) => {
      const names = permissionNames(tool);
      return !agentRules.some((rule) => names.has(rule.permission));
    })) {
      throw new Error("Build agent policy does not cover every discovered tool");
    }
    if (rulesEndWith(currentRules, desiredRules)) return;
    if (mode === "build" && !hasPlanDenial(currentRules, restrictedTools)) return;

    await request<RawSession>(config, `/session/${encodeURIComponent(sessionID)}`, {
      method: "PATCH",
      directory,
      body: { permission: desiredRules },
    });
  } catch (error) {
    if (error instanceof SessionAgentIdentityError) throw error;
    throw new ModePolicyActivationError(mode);
  }
}

export function toSummary(raw: RawSession, running: boolean): SessionSummary {
  const now = Date.now();
  return {
    id: raw.id ?? "",
    title: raw.title?.trim() || "Untitled session",
    directory: raw.directory ?? "",
    parentID: raw.parentID,
    childCount: 0,
    agent: raw.agent,
    model: raw.model
      ? { providerID: raw.model.providerID, modelID: raw.model.modelID ?? raw.model.id, variant: raw.model.variant }
      : undefined,
    cost: raw.cost ?? 0,
    tokens: {
      input: raw.tokens?.input ?? 0,
      output: raw.tokens?.output ?? 0,
      reasoning: raw.tokens?.reasoning ?? 0,
      cacheRead: raw.tokens?.cache?.read ?? 0,
      cacheWrite: raw.tokens?.cache?.write ?? 0,
    },
    createdAt: new Date(raw.time?.created ?? now).toISOString(),
    updatedAt: new Date(raw.time?.updated ?? raw.time?.created ?? now).toISOString(),
    archived: typeof raw.time?.archived === "number",
    shareUrl: safeShareUrl(raw.share?.url),
    running,
  };
}

type StatusMap = Record<string, { type?: string } | undefined>;

/** IDs the current server process is actively working on. */
export async function runningSessions(
  config: OpencodeConfig,
  directory: string,
): Promise<Set<string>> {
  const data = await request<StatusMap>(config, "/session/status", { directory });
  return new Set(
    Object.entries(data ?? {})
      .filter(([, value]) => value?.type === "busy" || value?.type === "retry")
      .map(([id]) => id),
  );
}

export async function listSessions(
  config: OpencodeConfig,
  directory: string,
  options: { limit?: number; rootsOnly?: boolean; search?: string } = {},
): Promise<SessionSummary[]> {
  const [raw, running] = await Promise.all([
    request<RawSession[]>(config, "/session", {
      directory,
      query: {
        limit: options.limit ?? 100,
        roots: options.rootsOnly ? true : undefined,
        search: options.search,
      },
    }),
    // A status failure must not blank the whole list.
    runningSessions(config, directory).catch(() => new Set<string>()),
  ]);
  const summaries = (raw ?? [])
    .filter((s) => !s.time?.archived)
    .map((s) => toSummary(s, running.has(s.id ?? "")));
  // A roots-only listing has no children to count, and reporting zero would
  // claim every root is a leaf. Leave the field untouched instead.
  return options.rootsOnly ? summaries : withChildCounts(summaries);
}

/**
 * Fill in `childCount` from the sessions we already have.
 *
 * Only meaningful over a full directory listing: with `roots=true` the children
 * are absent, so every count would read zero and the UI would claim leaf
 * sessions that are not leaves. Callers that filter to roots must not use this.
 */
export function withChildCounts(sessions: SessionSummary[]): SessionSummary[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (!session.parentID) continue;
    counts.set(session.parentID, (counts.get(session.parentID) ?? 0) + 1);
  }
  if (counts.size === 0) return sessions;
  return sessions.map((session) => {
    const childCount = counts.get(session.id) ?? 0;
    return childCount === session.childCount ? session : { ...session, childCount };
  });
}

/** Upstream calls in flight during a cross-project fan-out. */
export const RECENT_FANOUT_CONCURRENCY = 6;

/**
 * Sessions from many projects at once, newest first.
 *
 * There is no cross-project session list upstream: `/session` is
 * directory-scoped, so "recent across every project" can only be a fan-out.
 * Two properties matter more than speed here:
 *
 *   - A directory that fails must not blank the list. One unreadable or
 *     renamed project would otherwise take down a panel that is mostly about
 *     other projects, so per-directory failures are swallowed.
 *   - Concurrency is capped. The caller's directory list is user-controlled
 *     (pins plus browser history), and an unbounded Promise.all would let a
 *     large one open hundreds of upstream sockets at once.
 *
 * Each directory still costs two upstream calls (`/session` + `/session/status`)
 * because status is directory-scoped in 1.18.21. If a later server exposes a
 * process-global status map, hoist that single call out of the pool.
 */
export async function listSessionsAcross(
  config: OpencodeConfig,
  directories: string[],
  options: { perDirectoryLimit?: number } = {},
): Promise<SessionSummary[]> {
  const targets = [...new Set(directories.filter((directory) => directory))];
  const collected: SessionSummary[][] = targets.map(() => []);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      collected[index] = await listSessions(config, targets[index], {
        limit: options.perDirectoryLimit ?? 20,
      }).catch(() => []);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(RECENT_FANOUT_CONCURRENCY, targets.length) }, worker),
  );

  // Ties keep fan-out order, which is the caller's directory order, so the
  // result is stable across polls instead of shuffling on every refresh.
  return collected
    .flat()
    .map((session, index) => ({ session, index, updatedAt: Date.parse(session.updatedAt) }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.updatedAt) ? left.updatedAt : 0;
      const rightTime = Number.isFinite(right.updatedAt) ? right.updatedAt : 0;
      return rightTime - leftTime || left.index - right.index;
    })
    .map(({ session }) => session);
}

export async function getSession(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
): Promise<SessionSummary> {
  const [raw, running] = await Promise.all([
    request<RawSession>(config, `/session/${encodeURIComponent(sessionID)}`, { directory }),
    runningSessions(config, directory).catch(() => new Set<string>()),
  ]);
  return toSummary(raw ?? {}, running.has(sessionID));
}

export interface CreateSessionInput {
  directory: string;
  title?: string;
  agent?: string;
  model?: ModelSelection;
  parentID?: string;
}

export async function createSession(
  config: OpencodeConfig,
  input: CreateSessionInput,
): Promise<SessionSummary> {
  const raw = await request<RawSession>(config, "/session", {
    method: "POST",
    directory: input.directory,
    body: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.model ? {
        model: {
          providerID: input.model.providerID,
          id: input.model.modelID,
          ...(input.model.variant ? { variant: input.model.variant } : {}),
        },
      } : {}),
      ...(input.parentID ? { parentID: input.parentID } : {}),
    },
  });
  return toSummary(raw ?? {}, false);
}

export interface PromptInput {
  text: string;
  mode: AgentMode;
  model?: ModelSelection;
  attachments?: Array<{ filename: string; mime: string; url: string }>;
  reminder?: Pick<ReminderPreset, "id" | "body">;
}

/**
 * Send a prompt WITHOUT waiting for the turn.
 *
 * `/prompt_async` answers 204 immediately and the agent loop continues
 * server-side — which is what lets the browser close, the laptop sleep, and a
 * notification arrive later. Progress arrives over SSE.
 */
export async function prompt(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
  input: PromptInput,
): Promise<void> {
  await withSessionPromptLock(directory, sessionID, async () => {
    await activateModePolicy(config, directory, sessionID, input.mode);
    await request<void>(config, `/session/${encodeURIComponent(sessionID)}/prompt_async`, {
      method: "POST",
      directory,
      body: {
        agent: input.mode,
        ...(input.model ? {
          model: { providerID: input.model.providerID, modelID: input.model.modelID },
          ...(input.model.variant ? { variant: input.model.variant } : {}),
        } : {}),
        parts: [
          {
            type: "text",
            text: input.reminder ? withReminderTag(input.text, input.reminder) : input.text,
          },
          ...(input.attachments ?? []).map((attachment) => ({
            type: "file" as const,
            mime: attachment.mime,
            filename: attachment.filename,
            url: attachment.url,
          })),
        ],
      },
    });
  });
}

export async function abortSession(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
): Promise<void> {
  await request<unknown>(config, `/session/${encodeURIComponent(sessionID)}/abort`, {
    method: "POST",
    directory,
  });
}

export async function deleteSession(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
): Promise<void> {
  await request<unknown>(config, `/session/${encodeURIComponent(sessionID)}`, {
    method: "DELETE",
    directory,
  });
}

export async function shareSession(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
): Promise<SessionSummary> {
  const raw = await request<RawSession>(config, `/session/${encodeURIComponent(sessionID)}/share`, {
    method: "POST",
    directory,
  });
  return toSummary(raw ?? {}, false);
}

export async function unshareSession(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
): Promise<SessionSummary> {
  const raw = await request<RawSession>(config, `/session/${encodeURIComponent(sessionID)}/share`, {
    method: "DELETE",
    directory,
  });
  return toSummary(raw ?? {}, false);
}

export interface MessagePage {
  messages: unknown[];
  nextCursor: string | null;
}

export function messagePageCursor(headers: Headers): string | null {
  const direct = headers.get("x-next-cursor")?.trim();
  if (direct) return direct;

  const link = headers.get("link");
  if (!link) return null;
  for (const entry of link.split(/,(?=\s*<)/u)) {
    const match = entry.match(/^\s*<([^>]+)>(.*)$/u);
    if (!match || !/;\s*rel\s*=\s*"?next"?(?:\s*;|\s*$)/iu.test(match[2])) continue;
    try {
      const cursor = new URL(match[1], "http://opencode.invalid").searchParams.get("before")?.trim();
      if (cursor) return cursor;
    } catch {
      // Ignore a malformed Link entry and fall back to end-of-history.
    }
  }
  return null;
}

/** Raw `{ info, parts }` messages — the client-side adapter shapes them. */
export async function listMessages(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
  options: { limit?: number; before?: string } = {},
): Promise<MessagePage> {
  const response = await requestWithResponse<unknown[]>(
    config,
    `/session/${encodeURIComponent(sessionID)}/message`,
    {
      directory,
      query: {
        limit: options.limit ?? 100,
        before: options.before,
      },
    },
  );
  return {
    messages: response.data ?? [],
    nextCursor: messagePageCursor(response.headers),
  };
}

export interface Todo {
  content: string;
  status: string;
  priority: string;
}

/** NB: Todo has no `id` in 1.18.21 — the UI keys on index/content. */
export async function listTodos(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
): Promise<Todo[]> {
  const data = await request<Todo[]>(
    config,
    `/session/${encodeURIComponent(sessionID)}/todo`,
    { directory },
  );
  return data ?? [];
}
