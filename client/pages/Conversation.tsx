import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { LoadingIndicator } from "../ds/loading-indicator.js";
import { RunningIndicator, Transcript } from "../components/transcript.js";
import { api, formatCost, type SessionSummary } from "../lib/api.js";
import { collapseActionGroups, mergeEvents, runningActivity } from "../lib/derive.js";
import { normalizeTranscript, type RawMessage } from "../lib/events.js";
import { useSessionStream } from "../lib/useSessionStream.js";
import type { TranscriptEvent } from "../lib/transcript.js";

const WRAP_KEY = "opencode.wrapOutput.v1";

export function ConversationPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const directory = params.get("directory") ?? "";

  const stream = useSessionStream(directory, id);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [wrap, setWrap] = useState(() => localStorage.getItem(WRAP_KEY) !== "off");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Keep event identity stable across polls so memoised rows do not churn.
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const transcript = useMemo(
    () => normalizeTranscript(stream.messages as RawMessage[], { isRunning: stream.running }),
    [stream.messages, stream.running],
  );
  useEffect(() => {
    setEvents((previous) => mergeEvents(previous, transcript.events));
  }, [transcript.events]);

  useEffect(() => {
    if (!directory || !id) return;
    let cancelled = false;
    api
      .session(directory, id)
      .then((r) => !cancelled && setSession(r.session))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [directory, id, stream.running]);

  const items = useMemo(() => collapseActionGroups(events), [events]);
  const activity = useMemo(() => runningActivity(events), [events]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((state) => ({ ...state, [groupId]: !state[groupId] }));
  }, []);

  const toggleWrap = () => {
    setWrap((value) => {
      localStorage.setItem(WRAP_KEY, value ? "off" : "on");
      return !value;
    });
  };

  // Stick to the bottom as the transcript grows.
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await api.prompt(directory, id, text);
      setDraft("");
      stream.refresh();
    } finally {
      setSending(false);
    }
  };

  if (!directory) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Alert variant="danger">A `directory` query parameter is required to open a session.</Alert>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col" data-testid="opencode-conversation">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border-default)] px-4 py-3">
        <Link to={`/?directory=${encodeURIComponent(directory)}`} className="text-sm underline">
          ← Sessions
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="opencode-session-title">
          {session?.title ?? "Session"}
        </h1>
        {stream.running && <Badge variant="info">running</Badge>}
        {session && session.cost > 0 && (
          <span className="text-xs tabular-nums text-[var(--color-text-muted)]" data-testid="opencode-session-cost">
            {formatCost(session.cost)}
          </span>
        )}
        <Button size="sm" variant="secondary" onClick={toggleWrap} data-testid="opencode-wrap-toggle">
          {wrap ? "Wrap: on" : "Wrap: off"}
        </Button>
        {stream.running && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void api.abort(directory, id).then(stream.refresh)}
            data-testid="opencode-abort"
          >
            Stop
          </Button>
        )}
      </header>

      {/* R2: OpenCode never persists "running" state, so a crash mid-turn is
          invisible unless derived. We surface it and let the human decide —
          Resume prefills the composer rather than auto-sending, because
          replaying an interrupted turn can redo destructive work. */}
      {transcript.interrupted.interrupted && (
        <div className="px-4 pt-3" data-testid="opencode-interrupted">
          <Alert variant="warning">
            <span className="font-medium">
              {transcript.interrupted.reason === "never-answered"
                ? "This prompt was never answered."
                : "This run did not finish."}
            </span>{" "}
            The agent is not working on it now.{" "}
            <button
              type="button"
              className="underline"
              data-testid="opencode-resume"
              onClick={() => setDraft("Continue where you left off.")}
            >
              Resume
            </button>{" "}
            to put a follow-up in the composer.
          </Alert>
        </div>
      )}

      {stream.error && (
        <div className="px-4 pt-3">
          <Alert variant="danger" data-testid="opencode-error-banner">
            {stream.error}
          </Alert>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          className="thin-scrollbar min-w-0 flex-1 overflow-y-auto px-3 py-6 sm:px-6 sm:py-8"
          data-testid="opencode-transcript"
        >
          <div className="mx-auto max-w-3xl">
            {!stream.loaded ? (
              <LoadingIndicator />
            ) : items.length === 0 ? (
              <p className="py-16 text-center text-sm text-[var(--color-text-muted)]">
                No transcript events yet.
              </p>
            ) : (
              <Transcript
                items={items}
                wrap={wrap}
                collapsedGroups={collapsedGroups}
                onToggleGroup={toggleGroup}
              />
            )}
            {stream.running && (
              <div className="mt-6">
                <RunningIndicator activity={activity} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {stream.todos.length > 0 && (
          <aside
            className="hidden w-72 shrink-0 overflow-y-auto border-l border-[var(--color-border-default)] p-4 lg:block"
            aria-label="Task list"
            data-testid="opencode-task-list"
          >
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              Task list · {stream.todos.filter((t) => t.status === "completed").length}/
              {stream.todos.length} done
            </h2>
            <ul className="space-y-1.5">
              {/* Todo has no id in 1.18.19 — index is the only stable key. */}
              {stream.todos.map((todo, index) => (
                <li key={index} className="flex items-start gap-2 text-sm" data-status={todo.status}>
                  <span aria-hidden className="mt-0.5 shrink-0">
                    {todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "◐" : "○"}
                  </span>
                  <span className={todo.status === "completed" ? "text-[var(--color-text-muted)] line-through" : ""}>
                    {todo.content}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="border-t border-[var(--color-border-default)] p-3">
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder="Send a follow-up…"
            className="flex-1 rounded-md border border-[var(--color-border-default)] bg-transparent p-2 text-sm"
            data-testid="opencode-composer"
          />
          <Button onClick={() => void send()} disabled={sending || !draft.trim()} data-testid="opencode-send">
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </footer>
    </main>
  );
}
