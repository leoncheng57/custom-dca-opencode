// client/lib/useSessionStream.ts
//
// Live updates for a session. Two channels, deliberately:
//
//   1. A 3s poll, which is the DURABLE source of truth.
//   2. An SSE subscription, which only says "something changed, poll now".
//
// The stream never carries transcript content. If it drops, the UI degrades to
// exactly its pre-SSE behaviour instead of showing a divergent view.
//
// Connection budget matters: browsers cap HTTP/1.1 at ~6 connections per
// origin, so the stream opens only when the tab is visible AND the session is
// running. On error we close the EventSource ourselves — the browser's
// built-in infinite retry turned a server restart into a pool-exhausting
// storm in the predecessor — then back off 2s/4s/8s and give up, leaving the
// poll running.

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, type PermissionRequest } from "./api.js";

const POLL_MS = 3_000;
const RETRY_BASE_MS = 2_000;
const MAX_RETRIES = 3;

export function streamRetryDelay(retries: number): number | null {
  if (retries >= MAX_RETRIES) return null;
  return RETRY_BASE_MS * 2 ** retries;
}

export interface SessionStreamState {
  messages: unknown[];
  running: boolean;
  todos: Array<{ content: string; status: string; priority: string }>;
  permissions: PermissionRequest[];
  error: string | null;
  /** True once the first fetch has resolved, so the UI can skip a spinner. */
  loaded: boolean;
  refresh: () => void;
  replyPermission: (requestId: string, reply: "once" | "always" | "reject") => Promise<void>;
}

export function useSessionStream(directory: string, sessionId: string): SessionStreamState {
  const [messages, setMessages] = useState<unknown[]>([]);
  const [running, setRunning] = useState(false);
  const [todos, setTodos] = useState<Array<{ content: string; status: string; priority: string }>>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const inFlight = useRef(false);
  const pollQueued = useRef(false);
  const permissionRevision = useRef(0);
  // Guards a stale response landing after the user navigated elsewhere.
  const liveId = useRef(sessionId);
  liveId.current = sessionId;

  const poll = useCallback(async () => {
    if (inFlight.current) {
      pollQueued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        pollQueued.current = false;
        const permissionRevisionAtStart = permissionRevision.current;
        const [messageResult, todoResult, permissionResult] = await Promise.allSettled([
          api.messages(directory, sessionId),
          api.todos(directory, sessionId),
          api.permissionRequests(directory),
        ]);
        if (liveId.current !== sessionId) return;

        if (messageResult.status === "fulfilled") {
          setMessages(messageResult.value.messages);
          setRunning(messageResult.value.running);
          setError(null);
        } else {
          const reason = messageResult.reason as unknown;
          setError(reason instanceof Error ? reason.message : String(reason));
        }
        // Todos are supplementary — a failure there must not blank the transcript.
        if (todoResult.status === "fulfilled") setTodos(todoResult.value.todos);
        if (permissionResult.status === "fulfilled" && permissionRevisionAtStart === permissionRevision.current) {
          setPermissions(permissionResult.value.requests.filter((request) => request.sessionID === sessionId));
        }
      } while (pollQueued.current && liveId.current === sessionId);
    } finally {
      inFlight.current = false;
      setLoaded(true);
    }
  }, [directory, sessionId]);

  // Poll loop. Hidden tabs skip ticks and refresh once on return.
  useEffect(() => {
    void poll();
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // SSE nudge channel.
  useEffect(() => {
    let source: EventSource | null = null;
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const close = () => {
      source?.close();
      source = null;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const open = () => {
      if (disposed || source || document.visibilityState === "hidden") return;
      source = new EventSource(api.eventsUrl(directory));
      source.onopen = () => {
        retries = 0;
      };
      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as { type?: string; properties?: { sessionID?: string } };
          if (!event.type || event.type === "server.heartbeat" || event.type === "connected") return;
          // Only react to events about this session; the bus is global.
          const target = event.properties?.sessionID;
          if (target && target !== sessionId) return;
          void poll();
        } catch {
          /* a malformed frame must never kill the stream */
        }
      };
      source.onerror = () => {
        close();
        const delay = streamRetryDelay(retries);
        if (delay === null) return; // exhausted — the poll carries on alone
        retries += 1;
        retryTimer = setTimeout(open, delay);
      };
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        retries = 0;
        open();
      } else {
        close();
      }
    };

    open();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      close();
    };
  }, [directory, sessionId, poll]);

  const refresh = useCallback(() => {
    void poll();
  }, [poll]);

  const replyPermission = useCallback(async (requestId: string, reply: "once" | "always" | "reject") => {
    await api.replyPermission(directory, requestId, reply);
    permissionRevision.current += 1;
    if (liveId.current === sessionId) {
      setPermissions((requests) => requests.filter((request) => request.id !== requestId));
    }
    await poll();
  }, [directory, poll, sessionId]);

  return { messages, running, todos, permissions, error, loaded, refresh, replyPermission };
}

/** True when an error means "stop trying" rather than "retry later". */
export function isGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
