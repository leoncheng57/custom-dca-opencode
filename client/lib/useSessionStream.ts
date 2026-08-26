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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, type PermissionRequest, type QuestionRequest } from "./api.js";
import type { RawMessage } from "./events.js";
import { PUBLIC_SIMULATOR } from "./runtime.js";
import {
  appendOlderPage,
  emptyTranscriptPages,
  invalidateOlderPages,
  nextRevertState,
  mutationMessageID,
  pageHasMessage,
  refreshNewestPage,
  transcriptMessages,
  type TranscriptPages,
} from "./messagePages.js";

const POLL_MS = 3_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

export function streamRetryDelay(retries: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.min(retries, 4), RETRY_MAX_MS);
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
  const scopeRef = useRef(scope);
  const generationRef = useRef(0);
  const pollGate = useRef({ generation: 0, inFlight: false, queued: false });
  const backfillRequest = useRef<{ generation: number; historyGeneration: number } | null>(null);
  const earlierCursor = useRef<string | null>(null);
  const newestCursor = useRef<string | null>(null);
  const backfillStarted = useRef(false);
  const historyGeneration = useRef(0);
  const revertState = useRef<string | null | undefined>(undefined);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    generationRef.current += 1;
    pollGate.current = { generation: generationRef.current, inFlight: false, queued: false };
    backfillRequest.current = null;
    earlierCursor.current = null;
    backfillStarted.current = false;
    historyGeneration.current += 1;
    revertState.current = undefined;
  }
  const generation = generationRef.current;

  const [pages, setPages] = useState<TranscriptPages>(emptyTranscriptPages);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
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
  const [stateGeneration, setStateGeneration] = useState(generation);
  const permissionRevision = useRef(0);

  const poll = useCallback(async () => {
    let gate = pollGate.current;
    if (gate.generation !== generation) {
      gate = { generation, inFlight: false, queued: false };
      pollGate.current = gate;
    }
    if (gate.inFlight) {
      gate.queued = true;
      return;
    }
    gate.inFlight = true;
    try {
      do {
        gate.queued = false;
        const permissionRevisionAtStart = permissionRevision.current;
        const [messageResult, todoResult, permissionResult, questionResult] = await Promise.allSettled([
          api.messages(directory, sessionId, { limit: 100 }),
          api.todos(directory, sessionId),
          api.permissionRequests(directory),
          api.questionRequests(directory, sessionId),
        ]);
        if (generationRef.current !== generation) return;

        if (messageResult.status === "fulfilled") {
          setPages((previous) => refreshNewestPage(
            previous,
            messageResult.value.messages,
            messageResult.value.nextCursor,
            backfillStarted.current,
            100,
          ));
          newestCursor.current = messageResult.value.nextCursor;
          setRunning(messageResult.value.running);
          if (!backfillStarted.current || messageResult.value.messages.length === 0 || messageResult.value.nextCursor === null) {
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
      } while (gate.queued && generationRef.current === generation);
    } finally {
      if (pollGate.current === gate) {
        gate.inFlight = false;
      }
      if (generationRef.current === generation) setLoaded(true);
    }
  }, [directory, generation, sessionId]);

  useEffect(() => {
    setStateGeneration(generation);
    setPages(emptyTranscriptPages());
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
    newestCursor.current = null;
    backfillStarted.current = false;
    backfillRequest.current = null;
    historyGeneration.current += 1;
    revertState.current = undefined;
  }, [generation]);

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
    if (PUBLIC_SIMULATOR) return;
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
          const event = JSON.parse(message.data) as { type?: string; properties?: { sessionID?: string; messageID?: string; part?: { messageID?: string }; info?: { id?: string; revert?: unknown } } };
          if (!event.type) return;
          const eventType = event.type;
          // A valid application frame proves more than a TCP open. Reset here
          // so open/error loops continue backing off instead of cycling at 2s.
          retries = 0;
          if (eventType === "connected") {
            if (backfillStarted.current) {
              setPages((pages) => invalidateOlderPages(pages));
              backfillStarted.current = false;
              historyGeneration.current += 1;
              backfillRequest.current = null;
              setLoadingEarlier(false);
              earlierCursor.current = newestCursor.current;
              setHasEarlier(newestCursor.current !== null);
            }
            return;
          }
          if (eventType === "server.heartbeat") return;
          // Only react to events about this session; the bus is global.
          const target = event.properties?.sessionID;
          if (target && target !== sessionId) return;
          let invalidatedMessage = mutationMessageID(eventType, event.properties ?? {});
          let invalidateAll = false;
          if (eventType === "session.updated") {
            const transition = nextRevertState(revertState.current, event.properties?.info?.revert);
            revertState.current = transition.state;
            invalidateAll = transition.changed;
          }
          if (invalidatedMessage || invalidateAll) {
            if (invalidateAll || !invalidatedMessage || !pageHasMessage(pagesRef.current.newest, invalidatedMessage)) {
              historyGeneration.current += 1;
              backfillRequest.current = null;
              setLoadingEarlier(false);
            }
            setPages((pages) => {
              const next = invalidateOlderPages(pages, invalidateAll ? undefined : invalidatedMessage);
              if (next !== pages) {
                backfillStarted.current = false;
                earlierCursor.current = newestCursor.current;
                setHasEarlier(newestCursor.current !== null);
              }
              return next;
            });
          }
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
    const before = earlierCursor.current;
    if (!before || backfillRequest.current?.generation === generation) return;
    const request = { generation, historyGeneration: historyGeneration.current };
    backfillStarted.current = true;
    backfillRequest.current = request;
    setLoadingEarlier(true);
    setLoadEarlierError(null);
    try {
      const page = await api.messages(directory, sessionId, { limit: 100, before });
      if (generationRef.current !== generation || historyGeneration.current !== request.historyGeneration) return;
      setPages((previous) => appendOlderPage(previous, page.messages));
      earlierCursor.current = page.nextCursor;
      setHasEarlier(page.nextCursor !== null);
    } catch (reason) {
      if (generationRef.current === generation) {
        setLoadEarlierError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (generationRef.current === generation) setLoadingEarlier(false);
      if (backfillRequest.current === request) backfillRequest.current = null;
    }
  }, [directory, generation, sessionId]);

  const replyPermission = useCallback(async (requestId: string, reply: "once" | "always" | "reject") => {
    await api.replyPermission(directory, requestId, reply);
    if (generationRef.current !== generation) return;
    permissionRevision.current += 1;
    setPermissions((requests) => requests.filter((request) => request.id !== requestId));
    await poll();
  }, [directory, generation, poll, sessionId]);

  const currentScope = stateGeneration === generation;
  const messages = useMemo(() => transcriptMessages(pages), [pages]);
  return {
    messages: currentScope ? messages : [],
    running: currentScope && running,
    todos: currentScope ? todos : [],
    todosLoaded: currentScope && todosLoaded,
    todosError: currentScope ? todosError : null,
    permissions: currentScope ? permissions : [],
    questions: currentScope ? questions : [],
    error: currentScope ? error : null,
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
