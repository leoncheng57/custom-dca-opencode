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

export class PlanToolDiscoveryError extends Error {
  constructor() {
    super("Could not discover OpenCode tools; Plan prompt was not sent");
    this.name = "PlanToolDiscoveryError";
  }
}

async function planTools(config: OpencodeConfig, directory: string): Promise<Record<string, boolean>> {
  const toolIDs = await request<unknown>(config, "/experimental/tool/ids", { directory }).catch(() => {
    throw new PlanToolDiscoveryError();
  });
  if (!Array.isArray(toolIDs) || toolIDs.length === 0 || toolIDs.some((id) => typeof id !== "string" || !id)) {
    throw new PlanToolDiscoveryError();
  }
  return Object.fromEntries(toolIDs.map((id) => [id, PLAN_TOOL_ALLOWLIST.has(id)]));
}

export interface SessionSummary {
  id: string;
  title: string;
  directory: string;
  parentID?: string;
  agent?: string;
  model?: { providerID?: string; modelID?: string };
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
  model?: { providerID?: string; modelID?: string; id?: string };
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  time?: { created?: number; updated?: number; archived?: number };
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
      ? { providerID: raw.model.providerID, modelID: raw.model.modelID ?? raw.model.id }
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
  model?: { providerID: string; modelID: string };
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
      ...(input.model ? { model: input.model } : {}),
      ...(input.parentID ? { parentID: input.parentID } : {}),
    },
  });
  return toSummary(raw ?? {}, false);
}

export interface PromptInput {
  text: string;
  mode: AgentMode;
  model?: { providerID: string; modelID: string };
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
  const tools = input.mode === "plan" ? await planTools(config, directory) : undefined;
  await request<void>(config, `/session/${encodeURIComponent(sessionID)}/prompt_async`, {
    method: "POST",
    directory,
    body: {
      agent: input.mode,
      ...(tools ? { tools } : {}),
      ...(input.model ? { model: input.model } : {}),
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
