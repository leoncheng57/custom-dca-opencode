// client/lib/api.ts — typed fetch helpers for our BFF (/api).
//
// Same-origin, no auth headers: the BFF holds the OpenCode credential so the
// browser never sees it.

import type { RawMessage } from "./events.js";

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

  createSession: (input: {
    directory: string;
    title?: string;
    agent?: string;
    model?: { providerID: string; modelID: string };
    prompt?: string;
  }) =>
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ session: SessionSummary }>(r)),

  prompt: (directory: string, id: string, text: string, model?: { providerID: string; modelID: string }) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/prompt`, directory), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(model ? { model } : {}) }),
    }).then((r) => json<{ accepted: boolean }>(r)),

  abort: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}/abort`, directory), { method: "POST" }).then(
      (r) => json<{ aborted: boolean }>(r),
    ),

  remove: (directory: string, id: string) =>
    fetch(scoped(`/sessions/${encodeURIComponent(id)}`, directory), { method: "DELETE" }).then((r) =>
      json<void>(r),
    ),

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
