import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { LoadingIndicator } from "../ds/loading-indicator.js";
import { RunningIndicator, Transcript } from "../components/transcript.js";
import { SessionInspector } from "../components/session-inspector.js";
import { WorkspacePanels } from "../components/workspace-panels.js";
import { AgentModeToggle } from "../components/agent-mode-toggle.js";
import { api, formatCost, type ReminderSummary, type SessionSummary } from "../lib/api.js";
import { latestModeMessageID, modeFromMessages, type AgentMode } from "../lib/agentMode.js";
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [contextLimit, setContextLimit] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Array<{ filename: string; mime: string; url: string }>>([]);
  const [reminderCatalogue, setReminderCatalogue] = useState<ReminderSummary[]>([]);
  const [selectedReminder, setSelectedReminder] = useState("");
  const [mode, setMode] = useState<AgentMode>("build");
  const derivedModeMessage = useRef<string | undefined>(undefined);
  const modeSelectionDirty = useRef(false);

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
    if (!stream.loaded) return;
    const messageID = latestModeMessageID(stream.messages as RawMessage[]);
    if (messageID === derivedModeMessage.current) return;
    derivedModeMessage.current = messageID;
    const persistedMode = modeFromMessages(stream.messages as RawMessage[]);
    if (modeSelectionDirty.current && persistedMode !== mode) return;
    modeSelectionDirty.current = false;
    setMode(persistedMode);
  }, [mode, stream.loaded, stream.messages]);

  const selectMode = (nextMode: AgentMode) => {
    modeSelectionDirty.current = true;
    setMode(nextMode);
  };

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

  useEffect(() => {
    if (!directory || !id) return;
    void api.modelLimit(directory, id).then((result) => setContextLimit(result.context)).catch(() => setContextLimit(null));
  }, [directory, id]);

  useEffect(() => {
    let cancelled = false;
    void api.reminders().then((result) => {
      if (!cancelled) setReminderCatalogue(result.reminders);
    }).catch(() => {
      // A missing catalogue is optional; keep the picker hidden.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => collapseActionGroups(events), [events]);
  const activity = useMemo(() => runningActivity(events), [events]);
  const latestUsage = transcript.usage.at(-1);
  const contextTokens = latestUsage
    ? latestUsage.tokens.input + latestUsage.tokens.output + latestUsage.tokens.reasoning + latestUsage.tokens.cacheRead + latestUsage.tokens.cacheWrite
    : 0;

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
      await api.prompt(
        directory,
        id,
        text,
        mode,
        undefined,
        attachments,
        selectedReminder || undefined,
      );
      setDraft("");
      setAttachments([]);
      // Per-message choice: never let a reminder silently ride on later turns.
      setSelectedReminder("");
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
        {contextTokens > 0 && (
          <span className="text-xs tabular-nums text-[var(--color-text-muted)]" data-testid="opencode-context-tokens" title="Latest turn context tokens">
            context {Intl.NumberFormat(undefined, { notation: "compact" }).format(contextTokens)}
            {contextLimit ? ` / ${Math.round((contextTokens / contextLimit) * 100)}%` : ""}
          </span>
        )}
        <Button size="sm" variant="secondary" onClick={toggleWrap} data-testid="opencode-wrap-toggle">
          {wrap ? "Wrap: on" : "Wrap: off"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setWorkspaceOpen(true)} data-testid="opencode-workspace-open">
          Workspace
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

      {stream.permissions.map((permission) => (
        <div className="px-4 pt-3" key={permission.id} data-testid="opencode-permission-request">
          <Alert variant="warning">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm"><strong>{permission.permission}</strong> needs approval{permission.patterns.length ? `: ${permission.patterns.join(", ")}` : ""}</span>
              <Button size="sm" onClick={() => void api.replyPermission(directory, permission.id, "once").then(stream.refresh)} data-testid="opencode-permission-once">Allow once</Button>
              <Button size="sm" variant="secondary" onClick={() => void api.replyPermission(directory, permission.id, "always").then(stream.refresh)} data-testid="opencode-permission-always">Always</Button>
              <Button size="sm" variant="danger" onClick={() => void api.replyPermission(directory, permission.id, "reject").then(stream.refresh)} data-testid="opencode-permission-reject">Reject</Button>
            </div>
          </Alert>
        </div>
      ))}

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

        <SessionInspector events={events} todos={stream.todos} />
      </div>

      <footer className="border-t border-[var(--color-border-default)] p-3">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <AgentModeToggle mode={mode} onChange={selectMode} testId="opencode-composer-mode" />
            <span className="min-w-0 truncate text-[11px] text-[var(--color-text-muted)]">
              {mode === "plan" ? "Read-only analysis" : "Can modify files"}
            </span>
          </div>
          {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attachments.map((attachment, index) => <button key={`${attachment.filename}-${index}`} type="button" onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-[var(--color-border-default)] px-2 py-1 text-xs" data-testid="opencode-attachment-chip">{attachment.filename} x</button>)}</div>}
          <div className="flex min-w-0 gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-[var(--color-border-default)] px-3 text-xs font-semibold" data-testid="opencode-attach-label">
            Attach
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="sr-only" data-testid="opencode-attach" onChange={(event) => {
              const files = [...(event.target.files ?? [])].slice(0, Math.max(0, 4 - attachments.length)).filter((file) => file.size <= 3 * 1024 * 1024);
              void Promise.all(files.map((file) => new Promise<{ filename: string; mime: string; url: string }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ filename: file.name, mime: file.type, url: String(reader.result) });
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
              }))).then((next) => setAttachments((items) => [...items, ...next]));
              event.target.value = "";
            }} />
          </label>
          {reminderCatalogue.length > 0 && (
            <select
              value={selectedReminder}
              onChange={(event) => setSelectedReminder(event.target.value)}
              className={`min-w-0 rounded-md border px-2 text-xs ${
                selectedReminder
                  ? "border-[var(--color-border-focus)] bg-[var(--color-background-surface)] text-[var(--color-text-default)]"
                  : "border-[var(--color-border-default)] bg-transparent text-[var(--color-text-muted)]"
              }`}
              data-testid="composer-reminder-select"
              aria-label="Attach a reminder to this message"
              title="Attach one reminder to the next message only. Cleared after sending."
            >
              <option value="">+ reminder</option>
              {reminderCatalogue.map((reminder) => (
                <option key={reminder.id} value={reminder.id} title={reminder.description}>
                  {reminder.id}{reminder.triggers.length ? " (triggers ignored)" : ""}
                </option>
              ))}
            </select>
          )}
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
        </div>
      </footer>
      {workspaceOpen && <WorkspacePanels directory={directory} onClose={() => setWorkspaceOpen(false)} />}
    </main>
  );
}
