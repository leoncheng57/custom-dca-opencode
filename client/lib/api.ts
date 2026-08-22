// client/lib/api.ts — typed fetch helpers for our BFF (/api).
//
// Same-origin, no auth headers: the BFF holds the OpenCode credential so the
// browser never sees it.

import type { RawMessage } from "./events.js";
import type { AgentMode } from "./agentMode.js";
import type { ModelCatalogue, ModelSelection } from "./models.js";

export interface SessionSummary {
  id: string;
  title: string;
  directory: string;
  /** Present when another session delegated this one — i.e. it is a sub-agent. */
  parentID?: string;
  /** Non-archived children in the same directory. Zero for a leaf session. */
  childCount: number;
  agent?: string;
  model?: ModelSelection;
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
  running: boolean;
}

export interface Todo {
  content: string;
  status: string;
  priority: string;
}

/** Mirrors `server/opencode/subagents.ts`; see there for how each is derived. */
export type SubagentState = "launched" | "running" | "completed" | "failed" | "unknown";

export type SubagentEvidence =
  | "session-status"
  | "child-transcript"
  | "parent-completion"
  | "parent-task-part"
  | "launch-only"
  | "no-terminal-evidence";

export interface SubagentTask {
  sessionID: string;
  parentID: string;
  title: string;
  agent?: string;
  description?: string;
  state: SubagentState;
  evidence: SubagentEvidence;
  background: boolean;
  present: boolean;
  createdAt: string;
  updatedAt: string;
  cost: number;
  detail?: string;
}

export interface SubagentReport {
  parentID: string;
  tasks: SubagentTask[];
  capabilities: { backgroundSubagents: boolean };
  truncated: boolean;
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

export interface CatalogSkill { name: string; description: string; location?: string }
export interface CatalogCommand {
  name: string;
  description?: string;
  source?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
}
export interface CatalogResponse {
  servers: Record<string, McpStatus>;
  skills: CatalogSkill[];
  commands: CatalogCommand[];
  refreshedAt: string;
}

export type NotifyEvent = "idle" | "error" | "abort" | "permission" | "question" | "parked";
export interface NotificationPreferences {
  version: 1;
  ntfy: { enabled: boolean; server: string; topic: string; events: Record<NotifyEvent, boolean> };
  browser: { desktop: boolean; sound: boolean; volume: number; events: Record<NotifyEvent, boolean> };
  parkedPermissionSeconds: number;
}

export type NotificationHistoryState = "all" | "active" | "resolved";

/**
 * Why a record was never delivered, and the axis the noise filters act on.
 * Mirrors server/notifications/history.ts.
 */
export type NotificationSuppression = "auto-permissions" | "subagent";

/** Unresolved rows each filter is responsible for hiding, filter on or off. */
export type SuppressedActiveCounts = Record<NotificationSuppression, number>;

export interface NotificationRecord {
  id: string;
  kind: NotifyEvent;
  at: number;
  directory?: string;
  sessionID?: string;
  /** Session title as of the moment the notification fired, if it was known. */
  sessionTitle?: string;
  requestID?: string;
  title: string;
  body: string;
  /** Safe event copy for authenticated in-app notification rows. */
  displayBody?: string;
  click?: string;
  resolvedAt?: number;
  resolvedBy?: "checked" | "replied" | "reconciled" | "dismissed" | "suppressed";
  parkedAt?: number;
  delivery: {
    ntfy: "sent" | "off" | "failed";
    ntfyError?: string;
    /** Desktop-notification preference; sound and speech are device-local. */
    desktop: "allowed" | "off";
    suppressed?: NotificationSuppression;
  };
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
  number: number;
  project: string;
}
export interface ReviewComment { id: string; author: string; body: string; createdAt: string; resolved: boolean | null; discussionId: string | null; bodyTruncated: boolean }
export interface ReviewSummary { id: string; author: string; state: string; body: string; submittedAt: string; bodyTruncated: boolean }
export interface ReviewPipeline { id: string; status: string; webUrl: string; createdAt: string; completedAt: string; duration: number | null }
export interface ReviewCheck { id: string; name: string; stage: string; status: string; webUrl: string; startedAt: string; completedAt: string; duration: number | null; source: "check" | "status" | "job" }
export interface DetailSection<T> { value: T; error: "Authentication unavailable" | "Rate limited" | "Unavailable" | null; truncated: boolean }
export interface ReviewDetails {
  description: DetailSection<string>;
  comments: DetailSection<ReviewComment[]>;
  reviews: DetailSection<ReviewSummary[]>;
  pipelines: DetailSection<ReviewPipeline[]>;
  checks: DetailSection<ReviewCheck[]>;
  partial: boolean;
  auth: "available" | "unavailable" | "rate_limited";
}
export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: { messageID: string; callID: string };
}
export interface AutoPermissionStatus { enabled: boolean; error: string | null }
export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
  tool?: unknown;
}
export interface ReminderSummary {
  id: string;
  title: string;
  description: string;
  triggers: string[];
}

export interface MessagePage {
  messages: RawMessage[];
  running: boolean;
  nextCursor: string | null;
}

/**
 * Unwrap a response, surfacing the BFF's `{ error }` body when present.
 *
 * The status is attached so callers can distinguish "this session is gone"
 * (404, stop polling) from "the agent server is down" (502, keep retrying).
 */
export type ApiErrorCode = "SESSION_AGENT_UNKNOWN" | "SESSION_AGENT_UNSUPPORTED";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ApiErrorCode,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: ApiErrorCode | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      if (body.code === "SESSION_AGENT_UNKNOWN" || body.code === "SESSION_AGENT_UNSUPPORTED") code = body.code;
    } catch {
      /* keep the status-only message */
    }
    throw new ApiError(res.status, message, code);
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
  modelPins: () => fetch("/api/model-pins").then((r) => json<{ models: ModelSelection[] }>(r)),
  saveModelPins: (models: ModelSelection[]) =>
    fetch("/api/model-pins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: models.map(({ providerID, modelID }) => ({ providerID, modelID })) }),
    }).then((r) => json<{ models: ModelSelection[] }>(r)),

  sessions: (directory: string, limit = 100) =>
    fetch(scoped("/sessions", directory, { limit: String(limit) })).then((r) =>
      json<{ sessions: SessionSummary[] }>(r),
    ),

  /**
   * Recent sessions across projects. Unlike every other session call this one
   * is not scoped to a single directory: the caller passes the projects it
   * knows about and the BFF unions them with the shared pins.
   *
   * `lookupIDs` names sessions the browser opened previously. They are usually
   * not among the most recently active, so they have to be requested by id or
   * the "recently opened" panel would come back empty.
   */
  recentSessions: (directories: string[], lookupIDs: string[] = [], limit = 5) => {
    const query = new URLSearchParams({ limit: String(limit) });
    for (const directory of directories) query.append("directory", directory);
    for (const id of lookupIDs) query.append("session", id);
    return fetch(`/api/recent-sessions?${query}`).then((r) =>
      json<{ sessions: SessionSummary[]; directories: string[] }>(r),
    );
  },

  models: (directory: string) =>
    fetch(scoped("/models", directory)).then((r) => json<ModelCatalogue>(r)),

  session: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}`, directory)).then((r) =>
      json<{ session: SessionSummary }>(r),
    ),

  messages: (directory: string, id: string, options: { limit?: number; before?: string } = {}) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/messages`, directory, {
      limit: String(options.limit ?? 100),
      ...(options.before ? { before: options.before } : {}),
    })).then((r) =>
      json<MessagePage>(r),
    ),

  todos: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/todos`, directory)).then((r) =>
      json<{ todos: Todo[] }>(r),
    ),
  modelLimit: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/model-limit`, directory)).then((r) =>
      json<{ context: number | null }>(r),
    ),

  shareSession: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/share`, directory), {
      method: "POST",
    }).then((r) => json<{ session: SessionSummary }>(r)),
  unshareSession: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/share`, directory), {
      method: "DELETE",
    }).then((r) => json<{ session: SessionSummary }>(r)),

  createSession: (input: {
    directory: string;
    title?: string;
    mode?: AgentMode;
    model?: ModelSelection;
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
    model?: ModelSelection,
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

  subagents: (directory: string, id: string, signal?: AbortSignal) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/subagents`, directory), { signal }).then((r) =>
      json<SubagentReport>(r),
    ),

  abortSubagent: (directory: string, id: string, childID: string) =>
    fetch(
      scoped(`/sessions/${encodeURIComponent(id)}/subagents/${encodeURIComponent(childID)}/abort`, directory),
      { method: "POST" },
    ).then((r) => json<{ aborted: boolean }>(r)),

  backgroundSubagents: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/background`, directory), { method: "POST" }).then(
      (r) => json<{ promoted: boolean }>(r),
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
  catalog: (directory: string, signal?: AbortSignal) =>
    fetch(scoped("/catalog", directory), { signal }).then((r) => json<CatalogResponse>(r)),
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
  notificationHistory: (
    options: {
      limit?: number;
      kind?: NotifyEvent;
      state?: NotificationHistoryState;
      directory?: string;
      hideAutoApproved?: boolean;
      hideSubagent?: boolean;
    } = {},
  ) => {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.kind) query.set("kind", options.kind);
    if (options.state && options.state !== "all") query.set("state", options.state);
    if (options.directory) query.set("directory", options.directory);
    if (options.hideAutoApproved) query.set("hideAutoApproved", "1");
    if (options.hideSubagent) query.set("hideSubagent", "1");
    const suffix = query.size ? `?${query}` : "";
    return fetch(`/api/notifications/history${suffix}`).then((r) =>
      json<{
        records: NotificationRecord[];
        activeCount: number;
        suppressedActive?: SuppressedActiveCounts;
      }>(r),
    );
  },
  dismissNotification: (id: string) =>
    fetch(`/api/notifications/${encodeURIComponent(id)}/dismiss`, { method: "POST" }).then((r) =>
      json<{ dismissed: boolean; activeCount: number }>(r),
    ),
  setNotificationResolved: (id: string, resolved: boolean) =>
    fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).then((r) => json<{ record: NotificationRecord; activeCount: number }>(r)),

  autoPermissions: (directory: string) =>
    fetch(scoped("/auto-approve", directory)).then((r) => json<AutoPermissionStatus>(r)),
  setAutoPermissions: (directory: string, enabled: boolean) =>
    fetch(scoped("/auto-approve", directory), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).then((r) => json<AutoPermissionStatus>(r)),

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
  reviewDetails: (url: string) =>
    fetch(`/api/forge/review/details?${new URLSearchParams({ url })}`).then((r) => json<{ details: ReviewDetails }>(r)),
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
  questionRequests: (directory: string, sessionId: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(sessionId)}/questions`, directory)).then((r) =>
      json<{ requests: QuestionRequest[] }>(r),
    ),
  replyQuestion: (directory: string, sessionId: string, requestId: string, answers: string[][]) =>
    fetch(scoped(`/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(requestId)}/reply`, directory), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    }).then((r) => json<{ replied: boolean }>(r)),
  rejectQuestion: (directory: string, sessionId: string, requestId: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(requestId)}/reject`, directory), {
      method: "POST",
    }).then((r) => json<{ rejected: boolean }>(r)),
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
