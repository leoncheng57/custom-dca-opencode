// client/lib/api.ts — typed fetch helpers for our BFF (/api).
//
// Same-origin, no auth headers: the BFF holds the OpenCode credential so the
// browser never sees it.

import type { RawMessage } from "./events.js";
import type { AgentMode } from "./agentMode.js";

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
  running: boolean;
}

export interface Todo {
  content: string;
  status: string;
  priority: string;
}

export interface HealthResponse {
  healthy: boolean;
  upstream: {
    url: string;
    reachable: boolean;
    version?: string;
    expected?: string;
    versionMatches?: boolean;
    error?: string;
  };
  events?: { connected: boolean };
}

export interface AppSettings {
  model?: string;
  small_model?: string;
  default_agent?: string;
  subagent_depth?: number;
  compaction?: { auto?: boolean; prune?: boolean; reserved?: number };
}

export type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string };

export type NotifyEvent = "idle" | "error" | "abort" | "permission" | "question" | "parked";
export interface NotificationPreferences {
  version: 1;
  ntfy: { enabled: boolean; server: string; topic: string; events: Record<NotifyEvent, boolean> };
  browser: { desktop: boolean; sound: boolean; volume: number; events: Record<NotifyEvent, boolean> };
  parkedPermissionSeconds: number;
}

export interface WorkspaceNode {
  name: string;
  path: string;
  type: "file" | "directory";
  ignored: boolean;
}

export interface WorkspaceFile {
  path: string;
  type: "text" | "binary";
  content: string;
  encoding?: "base64";
  mimeType?: string;
}

export interface VcsFileDiff {
  file: string;
  patch?: string;
  additions: number;
  deletions: number;
  status?: "added" | "deleted" | "modified";
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  authoredAt: string;
}

export interface Worktree { name: string; branch?: string; directory: string }
export interface DiscoveredProject {
  name: string;
  relativePath: string;
  directory: string;
  kind: "repository" | "directory";
}
export interface ReviewStatus {
  url: string;
  forge: "github" | "gitlab";
  title: string;
  state: string;
  author: string;
  pipeline: string | null;
  mergeable: boolean | null;
  headSha: string;
}
export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
}
export interface ReminderSummary {
  id: string;
  description: string;
  triggers: string[];
}

/**
 * Unwrap a response, surfacing the BFF's `{ error }` body when present.
 *
 * The status is attached so callers can distinguish "this session is gone"
 * (404, stop polling) from "the agent server is down" (502, keep retrying).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep the status-only message */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Every project-scoped call threads ?directory=. */
function scoped(path: string, directory: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ directory, ...extra });
  return `/api${path}?${query}`;
}

export const api = {
  health: () => fetch("/api/health").then((r) => json<HealthResponse>(r)),
  appConfig: () => fetch("/api/app-config").then((r) => json<{ publicAppUrl: string | null }>(r)),
  projects: () => fetch("/api/projects").then((r) => json<{ root: string; projects: DiscoveredProject[] }>(r)),
  projectPins: () => fetch("/api/project-pins").then((r) => json<{ directories: string[] }>(r)),
  saveProjectPins: (directories: string[]) =>
    fetch("/api/project-pins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories }),
    }).then((r) => json<{ directories: string[] }>(r)),

  sessions: (directory: string, limit = 100) =>
    fetch(scoped("/sessions", directory, { limit: String(limit) })).then((r) =>
      json<{ sessions: SessionSummary[] }>(r),
    ),

  session: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}`, directory)).then((r) =>
      json<{ session: SessionSummary }>(r),
    ),

  messages: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/messages`, directory)).then((r) =>
      json<{ messages: RawMessage[]; running: boolean }>(r),
    ),

  todos: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/todos`, directory)).then((r) =>
      json<{ todos: Todo[] }>(r),
    ),
  modelLimit: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/model-limit`, directory)).then((r) =>
      json<{ context: number | null }>(r),
    ),

  createSession: (input: {
    directory: string;
    title?: string;
    mode?: AgentMode;
    model?: { providerID: string; modelID: string };
    prompt?: string;
    isolated?: boolean;
    worktreeName?: string;
  }) =>
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ session: SessionSummary }>(r)),

  prompt: (
    directory: string,
    id: string,
    text: string,
    mode: AgentMode,
    model?: { providerID: string; modelID: string },
    attachments?: Array<{ filename: string; mime: string; url: string }>,
    reminder?: string,
  ) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/prompt`, directory), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        mode,
        ...(model ? { model } : {}),
        ...(attachments?.length ? { attachments } : {}),
        ...(reminder ? { reminder } : {}),
      }),
    }).then((r) => json<{ accepted: boolean }>(r)),

  abort: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/abort`, directory), { method: "POST" }).then(
      (r) => json<{ aborted: boolean }>(r),
    ),

  remove: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}`, directory), { method: "DELETE" }).then((r) =>
      json<void>(r),
    ),

  settings: () => fetch("/api/settings").then((r) => json<{ settings: AppSettings }>(r)),
  saveSettings: (settings: AppSettings) =>
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then((r) => json<{ settings: AppSettings }>(r)),

  mcp: (directory: string) =>
    fetch(scoped("/mcp", directory)).then((r) => json<{ servers: Record<string, McpStatus> }>(r)),
  setMcp: (directory: string, name: string, connected: boolean) =>
    fetch(scoped(`/mcp/${encodeURIComponent(name)}/${connected ? "connect" : "disconnect"}`, directory), {
      method: "POST",
    }).then((r) => json<{ servers: Record<string, McpStatus> }>(r)),
  permissions: (directory: string) =>
    fetch(scoped("/permissions", directory)).then((r) => json<{ permissions: unknown }>(r)),
  lsp: (directory: string) =>
    fetch(scoped("/lsp", directory)).then((r) => json<{ servers: unknown }>(r)),

  notifications: () =>
    fetch("/api/notifications").then((r) =>
      json<{ preferences: NotificationPreferences; tokenConfigured: boolean }>(r),
    ),
  saveNotifications: (preferences: NotificationPreferences) =>
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    }).then((r) => json<{ preferences: NotificationPreferences; tokenConfigured: boolean }>(r)),
  testNtfy: () =>
    fetch("/api/notifications/test", { method: "POST" }).then((r) => json<{ sent: boolean }>(r)),

  workspaceTree: (directory: string, path = "") =>
    fetch(scoped("/workspace/tree", directory, { path })).then((r) =>
      json<{ path: string; dirs: WorkspaceNode[]; files: WorkspaceNode[] }>(r),
    ),
  workspaceFile: (directory: string, path: string) =>
    fetch(scoped("/workspace/file", directory, { path })).then((r) => json<WorkspaceFile>(r)),
  changes: (directory: string, mode: "git" | "branch") =>
    fetch(scoped("/workspace/changes", directory, { mode })).then((r) =>
      json<{ changes: VcsFileDiff[] }>(r),
    ),
  commits: (directory: string) =>
    fetch(scoped("/workspace/commits", directory)).then((r) => json<{ commits: GitCommit[] }>(r)),
  worktrees: (directory: string) =>
    fetch(scoped("/worktrees", directory)).then((r) => json<{ worktrees: Worktree[] }>(r)),
  createWorktree: (directory: string, name?: string) =>
    fetch(scoped("/worktrees", directory), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    }).then((r) => json<{ worktree: Worktree }>(r)),
  resetWorktree: (directory: string, worktreeDirectory: string) =>
    fetch(scoped("/worktrees/reset", directory), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worktreeDirectory }),
    }).then((r) => json<{ reset: boolean }>(r)),
  deleteWorktree: (directory: string, worktreeDirectory: string) =>
    fetch(scoped("/worktrees", directory), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worktreeDirectory }),
    }).then((r) => json<void>(r)),
  review: (url: string) =>
    fetch(`/api/forge/review?${new URLSearchParams({ url })}`).then((r) => json<{ review: ReviewStatus }>(r)),
  mergeReview: (url: string, expectedSha: string) =>
    fetch("/api/forge/review/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, expectedSha }),
    }).then((r) => json<{ merged: boolean }>(r)),
  permissionRequests: (directory: string) =>
    fetch(scoped("/permission-requests", directory)).then((r) =>
      json<{ requests: PermissionRequest[] }>(r),
    ),
  replyPermission: (directory: string, requestId: string, reply: "once" | "always" | "reject") =>
    fetch(scoped(`/permission-requests/${encodeURIComponent(requestId)}/reply`, directory), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    }).then((r) => json<{ replied: boolean }>(r)),
  reminders: () =>
    fetch("/api/reminders").then((r) => json<{ reminders: ReminderSummary[] }>(r)),

  /** SSE endpoint URL — consumed by EventSource, not fetch. */
  eventsUrl: (directory?: string) =>
    directory ? `/api/events?directory=${encodeURIComponent(directory)}` : "/api/events",
};

/** Format a dollar amount the way the status bar and list rows expect. */
export function formatCost(cost: number | undefined): string {
  if (!cost) return "$0.00";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}
