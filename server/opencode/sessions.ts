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
import { request, type OpencodeConfig } from "./client.js";

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

const EDIT_TOOL_ALIASES = new Set(["edit", "write", "apply_patch"]);
const sessionPromptTails = new Map<string, Promise<void>>();

export class ModePolicyActivationError extends Error {
  constructor(mode: AgentMode) {
    super(`Could not activate OpenCode ${mode === "plan" ? "Plan" : "Build"} policy; prompt was not sent`);
    this.name = "ModePolicyActivationError";
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
  parentID?: string;
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
  time?: { created?: number; updated?: number; archived?: number };
}

async function activateModePolicy(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
  mode: AgentMode,
): Promise<void> {
  try {
    const [toolIDs, session, agents] = await Promise.all([
      request<unknown>(config, "/experimental/tool/ids", { directory }),
      request<RawSession>(config, `/session/${encodeURIComponent(sessionID)}`, { directory }),
      request<unknown>(config, "/agent", { directory }),
    ]);
    if (!Array.isArray(toolIDs) || toolIDs.length === 0 || toolIDs.some((id) => typeof id !== "string" || !id)) {
      throw new Error("invalid tool catalogue");
    }
    if (session.permission !== undefined && !validRuleset(session.permission)) {
      throw new Error("invalid session permission rules");
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
  } catch {
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
  return (raw ?? [])
    .filter((s) => !s.time?.archived)
    .map((s) => toSummary(s, running.has(s.id ?? "")));
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

/** Raw `{ info, parts }` messages — the client-side adapter shapes them. */
export async function listMessages(
  config: OpencodeConfig,
  directory: string,
  sessionID: string,
): Promise<unknown[]> {
  const data = await request<unknown[]>(
    config,
    `/session/${encodeURIComponent(sessionID)}/message`,
    { directory },
  );
  return data ?? [];
}

export interface Todo {
  content: string;
  status: string;
  priority: string;
}

/** NB: Todo has no `id` in 1.18.19 — the UI keys on index/content. */
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
