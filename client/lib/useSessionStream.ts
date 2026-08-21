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
// origin, so the stream opens only when the tab is visible. On error we close
// the EventSource ourselves — the browser's
// built-in infinite retry turned a server restart into a pool-exhausting
// storm in the predecessor — then reconnect with a capped 2s/4s/8s/16s/30s
// backoff. The cap survives phone network handovers without reconnect storms;
// the durable poll keeps serving updates between attempts.

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, type PermissionRequest, type QuestionRequest } from "./api.js";
import type { RawMessage } from "./events.js";

const POLL_MS = 3_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

export function streamRetryDelay(retries: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.min(retries, 4), RETRY_MAX_MS);
}

function messageIdentity(message: RawMessage): string {
  const messageID = message.info?.id ?? message.parts?.find((part) => part.messageID)?.messageID;
  if (messageID) return `message:${messageID}`;
  const partIDs = message.parts?.map((part) => part.id).filter((id): id is string => Boolean(id));
  if (partIDs?.length) return `parts:${partIDs.join("\0")}`;
  return `unknown:${JSON.stringify(message)}`;
}

function messageCreated(message: RawMessage): number {
  return message.info?.time?.created ?? 0;
}

/** Merge overlapping newest/older pages without changing message or part IDs. */
export function mergeMessagePages(previous: RawMessage[], incoming: RawMessage[]): RawMessage[] {
  if (incoming.length === 0) return previous;
  const byID = new Map(previous.map((message) => [messageIdentity(message), message]));
  for (const message of incoming) byID.set(messageIdentity(message), message);
  return [...byID.values()].sort((left, right) => {
    const created = messageCreated(left) - messageCreated(right);
    return created || messageIdentity(left).localeCompare(messageIdentity(right));
  });
}

export interface SessionStreamState {
  messages: RawMessage[];
  running: boolean;
  todos: Array<{ content: string; status: string; priority: string }>;
  todosLoaded: boolean;
  todosError: string | null;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  error: string | null;
  /** True once the first fetch has resolved, so the UI can skip a spinner. */
  loaded: boolean;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  loadEarlierError: string | null;
  refresh: () => void;
  loadEarlier: () => Promise<void>;
  replyPermission: (requestId: string, reply: "once" | "always" | "reject") => Promise<void>;
}

export function useSessionStream(directory: string, sessionId: string): SessionStreamState {
  const scope = `${directory}\0${sessionId}`;
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [todos, setTodos] = useState<Array<{ content: string; status: string; priority: string }>>([]);
  const [todosLoaded, setTodosLoaded] = useState(false);
  const [todosError, setTodosError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [questions, setQuestions] = useState<QuestionRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [loadEarlierError, setLoadEarlierError] = useState<string | null>(null);

  const inFlight = useRef(false);
  const inFlightScope = useRef<string | null>(null);
  const pollQueued = useRef(false);
  const permissionRevision = useRef(0);
  const earlierCursor = useRef<string | null>(null);
  const backfillStarted = useRef(false);
  const backfillInFlight = useRef(false);
  // Guards a stale response landing after the user navigated elsewhere.
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const messagesScope = useRef(scope);

  const poll = useCallback(async () => {
    const requestedScope = `${directory}\0${sessionId}`;
    if (inFlight.current) {
      if (inFlightScope.current === requestedScope) {
        pollQueued.current = true;
        return;
      }
      // A request for the previous route may still be settling. Its scope
      // guard prevents writes, so do not let it delay the new session.
      inFlight.current = false;
    }
    inFlight.current = true;
    inFlightScope.current = requestedScope;
    try {
      do {
        pollQueued.current = false;
        const permissionRevisionAtStart = permissionRevision.current;
        const [messageResult, todoResult, permissionResult, questionResult] = await Promise.allSettled([
          api.messages(directory, sessionId, { limit: 100 }),
          api.todos(directory, sessionId),
          api.permissionRequests(directory),
          api.questionRequests(directory, sessionId),
        ]);
        if (liveScope.current !== requestedScope) return;

        if (messageResult.status === "fulfilled") {
          messagesScope.current = requestedScope;
          setMessages((previous) => mergeMessagePages(previous, messageResult.value.messages));
          setRunning(messageResult.value.running);
          if (!backfillStarted.current) {
            earlierCursor.current = messageResult.value.nextCursor;
            setHasEarlier(messageResult.value.nextCursor !== null);
          }
          setError(null);
        } else {
          const reason = messageResult.reason as unknown;
          setError(reason instanceof Error ? reason.message : String(reason));
        }
        // Todos are supplementary — a failure there must not blank the transcript.
        if (todoResult.status === "fulfilled") {
          setTodos(todoResult.value.todos);
          setTodosError(null);
        } else {
          const reason = todoResult.reason as unknown;
          setTodosError(reason instanceof Error ? reason.message : String(reason));
        }
        setTodosLoaded(true);
        if (permissionResult.status === "fulfilled" && permissionRevisionAtStart === permissionRevision.current) {
          setPermissions(permissionResult.value.requests.filter((request) => request.sessionID === sessionId));
        }
        if (questionResult.status === "fulfilled") setQuestions(questionResult.value.requests);
      } while (pollQueued.current && liveScope.current === requestedScope);
    } finally {
      if (inFlightScope.current === requestedScope) {
        inFlight.current = false;
        inFlightScope.current = null;
      }
      if (liveScope.current === requestedScope) setLoaded(true);
    }
  }, [directory, sessionId]);

  useEffect(() => {
    messagesScope.current = scope;
    setMessages([]);
    setRunning(false);
    setTodos([]);
    setTodosLoaded(false);
    setTodosError(null);
    setPermissions([]);
    setQuestions([]);
    setError(null);
    setLoaded(false);
    setHasEarlier(false);
    setLoadingEarlier(false);
    setLoadEarlierError(null);
    earlierCursor.current = null;
    backfillStarted.current = false;
    backfillInFlight.current = false;
  }, [directory, scope, sessionId]);

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
      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as { type?: string; properties?: { sessionID?: string } };
          if (!event.type) return;
          // A valid application frame proves more than a TCP open. Reset here
          // so open/error loops continue backing off instead of cycling at 2s.
          retries = 0;
          if (event.type === "server.heartbeat" || event.type === "connected") return;
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

    const onOnline = () => {
      if (disposed || document.visibilityState === "hidden") return;
      close();
      retries = 0;
      open();
    };

    open();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      close();
    };
  }, [directory, sessionId, poll]);

  const refresh = useCallback(() => {
    void poll();
  }, [poll]);

  const loadEarlier = useCallback(async () => {
    const requestedScope = `${directory}\0${sessionId}`;
    const before = earlierCursor.current;
    if (!before || backfillInFlight.current) return;
    backfillStarted.current = true;
    backfillInFlight.current = true;
    setLoadingEarlier(true);
    setLoadEarlierError(null);
    try {
      const page = await api.messages(directory, sessionId, { limit: 100, before });
      if (liveScope.current !== requestedScope) return;
      setMessages((previous) => mergeMessagePages(previous, page.messages));
      earlierCursor.current = page.nextCursor;
      setHasEarlier(page.nextCursor !== null);
    } catch (reason) {
      if (liveScope.current === requestedScope) {
        setLoadEarlierError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (liveScope.current === requestedScope) setLoadingEarlier(false);
      backfillInFlight.current = false;
    }
  }, [directory, sessionId]);

  const replyPermission = useCallback(async (requestId: string, reply: "once" | "always" | "reject") => {
    await api.replyPermission(directory, requestId, reply);
    permissionRevision.current += 1;
    if (liveScope.current === `${directory}\0${sessionId}`) {
      setPermissions((requests) => requests.filter((request) => request.id !== requestId));
    }
    await poll();
  }, [directory, poll, sessionId]);

  const currentScope = messagesScope.current === scope;
  return {
    messages: currentScope ? messages : [],
    running: currentScope && running,
    todos,
    todosLoaded,
    todosError,
    permissions,
    questions,
    error,
    loaded: currentScope && loaded,
    hasEarlier: currentScope && hasEarlier,
    loadingEarlier: currentScope && loadingEarlier,
    loadEarlierError: currentScope ? loadEarlierError : null,
    refresh,
    loadEarlier,
    replyPermission,
  };
}

/** True when an error means "stop trying" rather than "retry later". */
export function isGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
