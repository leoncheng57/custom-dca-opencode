import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { LoadingIndicator } from "../ds/loading-indicator.js";
import { RunningIndicator, Transcript } from "../components/transcript.js";
import { SessionInspector } from "../components/session-inspector.js";
import { WorkspacePanels } from "../components/workspace-panels.js";
import { AgentModeToggle } from "../components/agent-mode-toggle.js";
import { AutoPermissionsControl } from "../components/auto-permissions-control.js";
import { ModelSelect } from "../components/model-select.js";
import { QuestionRequest } from "../components/question-request.js";
import { ShareExportDialog } from "../components/share-export-dialog.js";
import { api, formatCost, type ReminderSummary, type SessionSummary } from "../lib/api.js";
import { latestModeMessageID, modeFromMessages, type AgentMode } from "../lib/agentMode.js";
import { MAX_IMAGE_ATTACHMENTS, readImageAttachment, selectImageFiles, type ImageAttachment } from "../lib/attachments.js";
import { composerEnterAction } from "../lib/composerKeys.js";
import { collapseActionGroups, mergeEvents, runningActivity } from "../lib/derive.js";
import { normalizeTranscript, type RawMessage } from "../lib/events.js";
import { useSessionStream } from "../lib/useSessionStream.js";
import type { TranscriptEvent } from "../lib/transcript.js";
import type { ShareTarget } from "../lib/sessionSharing.js";
import { recordRecentSessionOpen } from "../lib/recentSessions.js";
import {
  catalogueDefault,
  currentModelFromMessages,
  latestModelMessageID,
  modelKey,
  sameModel,
  sameModelID,
  type ModelCatalogue,
  type ModelSelection,
} from "../lib/models.js";

const WRAP_KEY = "opencode.wrapOutput.v1";

export function ConversationPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const directory = params.get("directory") ?? "";

  useEffect(() => {
    if (directory && id) recordRecentSessionOpen(localStorage, directory, id);
  }, [directory, id]);

  const stream = useSessionStream(directory, id);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [wrap, setWrap] = useState(() => localStorage.getItem(WRAP_KEY) !== "off");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [contextLimit, setContextLimit] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [reminderCatalogue, setReminderCatalogue] = useState<ReminderSummary[]>([]);
  const [selectedReminder, setSelectedReminder] = useState("");
  const [mode, setMode] = useState<AgentMode>("build");
  const derivedModeMessage = useRef<string | undefined>(undefined);
  const modeSelectionDirty = useRef(false);
  const [replyingPermission, setReplyingPermission] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [modelCatalogue, setModelCatalogue] = useState<ModelCatalogue | null>(null);
  const [currentModel, setCurrentModel] = useState<ModelSelection | undefined>();
  const [selectedModel, setSelectedModel] = useState<ModelSelection | undefined>();
  const [modelError, setModelError] = useState<string | null>(null);
  const derivedModelMarker = useRef<string | undefined>(undefined);
  const modelSelectionDirty = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const transcriptScrollerRef = useRef<HTMLDivElement | null>(null);
  const transcriptContentRef = useRef<HTMLDivElement | null>(null);
  const followingTranscript = useRef(true);
  const transcriptScrollInitialized = useRef(false);
  const transcriptHeight = useRef(0);
  const [newActivity, setNewActivity] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  // Keep event identity stable across polls so memoised rows do not churn.
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const eventScope = useRef(`${directory}\0${id}`);
  const transcript = useMemo(
    () => normalizeTranscript(stream.messages as RawMessage[], { isRunning: stream.running }),
    [stream.messages, stream.running],
  );
  useEffect(() => {
    const scope = `${directory}\0${id}`;
    setEvents((previous) => {
      if (eventScope.current !== scope) {
        eventScope.current = scope;
        return transcript.events;
      }
      return mergeEvents(previous, transcript.events);
    });
  }, [directory, id, transcript.events]);

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
    if (!stream.loaded) return;
    const persisted = currentModelFromMessages(stream.messages as RawMessage[], session?.model);
    const marker = `${latestModelMessageID(stream.messages as RawMessage[]) ?? "session"}:${persisted ? `${modelKey(persisted)}:${persisted.variant ?? ""}` : ""}`;
    if (marker === derivedModelMarker.current) return;
    derivedModelMarker.current = marker;
    setCurrentModel(persisted);
    if (modelSelectionDirty.current && !sameModel(persisted, selectedModel)) return;
    modelSelectionDirty.current = false;
    setSelectedModel(persisted);
  }, [selectedModel, session?.model, stream.loaded, stream.messages]);

  const selectModel = (model: ModelSelection) => {
    modelSelectionDirty.current = true;
    setSelectedModel(model);
  };

  useEffect(() => {
    if (!directory || !id) return;
    let cancelled = false;
    api
      .session(directory, id)
      .then((r) => !cancelled && setSession(r.session))
      .catch(() => undefined)
      .finally(() => !cancelled && setSessionLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [directory, id, stream.running]);

  useEffect(() => {
    if (!directory || !id) return;
    void api.modelLimit(directory, id).then((result) => setContextLimit(result.context)).catch(() => setContextLimit(null));
  }, [directory, id]);

  useEffect(() => {
    if (!directory) return;
    let cancelled = false;
    void api.models(directory).then((catalogue) => {
      if (cancelled) return;
      setModelCatalogue(catalogue);
      setModelError(null);
    }).catch((cause: Error) => {
      if (!cancelled) setModelError(`Model catalogue unavailable: ${cause.message}`);
    });
    return () => {
      cancelled = true;
    };
  }, [directory]);

  useEffect(() => {
    if (!modelCatalogue || !stream.loaded || !sessionLoaded || currentModel || selectedModel) return;
    if (currentModelFromMessages(stream.messages as RawMessage[], session?.model)) return;
    const fallback = catalogueDefault(modelCatalogue);
    if (fallback) {
      setCurrentModel(fallback);
      setSelectedModel(fallback);
    }
  }, [currentModel, modelCatalogue, selectedModel, session?.model, sessionLoaded, stream.loaded, stream.messages]);

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
  const selectedModelDetails = modelCatalogue?.models.find((model) => sameModelID(model, selectedModel));
  const displayedContextLimit = selectedModelDetails?.limits.context ?? contextLimit;

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((state) => ({ ...state, [groupId]: !state[groupId] }));
  }, []);
  const exportMessage = useCallback((event: Extract<TranscriptEvent, { kind: "user" | "agent" }>) => {
    setShareTarget({ kind: "message", messageId: event.messageId, role: event.kind === "user" ? "user" : "assistant" });
  }, []);

  const toggleWrap = () => {
    setWrap((value) => {
      localStorage.setItem(WRAP_KEY, value ? "off" : "on");
      return !value;
    });
  };

  // Follow live output only while the reader remains near the bottom. Depending
  // on the event array (not its length) also covers a streaming row growing in
  // place rather than only newly appended rows.
  useLayoutEffect(() => {
    const scroller = transcriptScrollerRef.current;
    if (!scroller) return;
    if (!transcriptScrollInitialized.current || followingTranscript.current) {
      scroller.scrollTop = scroller.scrollHeight;
      transcriptScrollInitialized.current = true;
      setNewActivity(false);
    } else {
      setNewActivity(true);
    }
  }, [events]);

  useEffect(() => {
    const scroller = transcriptScrollerRef.current;
    const content = transcriptContentRef.current;
    if (!scroller || !content || typeof ResizeObserver === "undefined") return;
    followingTranscript.current = true;
    transcriptScrollInitialized.current = false;
    transcriptHeight.current = 0;
    setNewActivity(false);
    let frame = 0;
    const sync = () => {
      frame = 0;
      const grew = scroller.scrollHeight > transcriptHeight.current;
      transcriptHeight.current = scroller.scrollHeight;
      if (followingTranscript.current) {
        scroller.scrollTop = scroller.scrollHeight;
        setNewActivity(false);
      } else if (grew) {
        setNewActivity(true);
      }
    };
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    });
    observer.observe(scroller);
    observer.observe(content);
    sync();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [directory, id]);

  const updateTranscriptFollow = () => {
    const scroller = transcriptScrollerRef.current;
    if (!scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 96;
    followingTranscript.current = nearBottom;
    if (nearBottom) setNewActivity(false);
  };

  const jumpToLatest = () => {
    const scroller = transcriptScrollerRef.current;
    if (!scroller) return;
    followingTranscript.current = true;
    setNewActivity(false);
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  };

  // The composer grows with its content instead of showing a resize grabber.
  // `min-h-24` still floors the box, so a one-line draft keeps the same 96px
  // target the mobile layout is measured against.
  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const modelOverride = selectedModel && !sameModel(selectedModel, currentModel) ? selectedModel : undefined;
      await api.prompt(
        directory,
        id,
        text,
        mode,
        modelOverride,
        attachments,
        selectedReminder || undefined,
      );
      setDraft("");
      setAttachments([]);
      // Per-message choice: never let a reminder silently ride on later turns.
      setSelectedReminder("");
      if (modelOverride) {
        setCurrentModel(modelOverride);
        modelSelectionDirty.current = false;
      }
      stream.refresh();
    } finally {
      setSending(false);
    }
  };

  // Policy lives in composerKeys.ts so the coarse-pointer and IME branches are
  // unit tested; this only wires it to the DOM event.
  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = composerEnterAction(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
        keyCode: event.nativeEvent.keyCode,
      },
      {
        coarsePointer: window.matchMedia("(pointer: coarse)").matches,
        // `send()` has no re-entry guard and prompt_async returns as soon as
        // the turn is queued, so a fast double Enter would post two turns.
        canSubmit: !sending && draft.trim().length > 0,
      },
    );
    if (action.preventDefault) event.preventDefault();
    if (action.submit) void send();
  };

  const replyToPermission = async (requestId: string, reply: "once" | "always" | "reject") => {
    setReplyingPermission(requestId);
    setPermissionError(null);
    try {
      await stream.replyPermission(requestId, reply);
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : String(error));
    } finally {
      setReplyingPermission(null);
    }
  };

  const addAttachments = (files: Iterable<File>) => {
    const selection = selectImageFiles(files, attachments.length);
    setAttachmentError(selection.error);
    if (!selection.files.length) return;
    void Promise.all(selection.files.map(readImageAttachment))
      .then((next) => setAttachments((items) => [...items, ...next].slice(0, MAX_IMAGE_ATTACHMENTS)))
      .catch(() => setAttachmentError("Could not read the selected image."));
  };

  if (!directory) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Alert variant="danger">A `directory` query parameter is required to open a session.</Alert>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="opencode-conversation">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border-default)] px-4 py-3">
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
            {displayedContextLimit ? ` / ${Math.round((contextTokens / displayedContextLimit) * 100)}%` : ""}
          </span>
        )}
        <Button size="sm" variant="secondary" onClick={toggleWrap} data-testid="opencode-wrap-toggle">
          {wrap ? "Wrap: on" : "Wrap: off"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShareTarget({ kind: "session" })} data-testid="opencode-share-export-open">
          Share
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setWorkspaceOpen(true)} data-testid="opencode-workspace-open">
          Workspace
        </Button>
        <Button className="min-h-11 lg:hidden" size="sm" variant="secondary" onClick={() => setInspectorOpen(true)} data-testid="opencode-mobile-inspector-open">
          Details
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

      <div className="px-4 pt-3">
        <AutoPermissionsControl directory={directory} testId="opencode-conversation-auto-permissions" />
      </div>

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
      {modelError && (
        <div className="px-4 pt-3">
          <Alert variant="warning" data-testid="opencode-model-error">{modelError}</Alert>
        </div>
      )}

      {stream.permissions.map((permission) => (
        <div className="px-4 pt-3" key={permission.id} data-testid="opencode-permission-request">
          <Alert variant="warning">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm"><strong>{permission.permission}</strong> needs approval{permission.patterns.length ? `: ${permission.patterns.join(", ")}` : ""}</span>
              <Button size="sm" disabled={replyingPermission !== null} onClick={() => void replyToPermission(permission.id, "once")} data-testid="opencode-permission-once">{replyingPermission === permission.id ? "Approving..." : "Allow once"}</Button>
              <Button size="sm" variant="secondary" disabled={replyingPermission !== null} onClick={() => void replyToPermission(permission.id, "always")} data-testid="opencode-permission-always">Always</Button>
              <Button size="sm" variant="danger" disabled={replyingPermission !== null} onClick={() => void replyToPermission(permission.id, "reject")} data-testid="opencode-permission-reject">Reject</Button>
            </div>
          </Alert>
        </div>
      ))}
      {permissionError && (
        <div className="px-4 pt-3" data-testid="opencode-permission-error">
          <Alert variant="danger">Could not answer the permission request: {permissionError}</Alert>
        </div>
      )}

      {stream.questions.map((request) => (
        <QuestionRequest key={request.id} directory={directory} sessionID={id} request={request} onResolved={stream.refresh} />
      ))}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={transcriptScrollerRef}
          onScroll={updateTranscriptFollow}
          className="thin-scrollbar relative min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-6 sm:px-6 sm:py-8"
          data-testid="opencode-transcript"
        >
          {newActivity && (
            <div
              className="sticky z-10 flex h-0 justify-center"
              style={{ top: "calc(100% - 3.5rem)" }}
              data-testid="opencode-new-activity"
            >
              <Button
                size="sm"
                variant="secondary"
                className="shadow-md"
                onClick={jumpToLatest}
                aria-label="Jump to latest activity"
                data-testid="opencode-jump-to-latest"
              >
                Jump to latest
              </Button>
            </div>
          )}
          <div ref={transcriptContentRef} className="mx-auto min-w-0 max-w-3xl">
            {stream.loaded && stream.hasEarlier && (
              <div className="mb-6 flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={stream.loadingEarlier}
                  onClick={() => void stream.loadEarlier()}
                  aria-label="Load earlier transcript messages"
                  data-testid="opencode-load-earlier"
                >
                  {stream.loadingEarlier ? "Loading earlier..." : "Load earlier"}
                </Button>
              </div>
            )}
            {stream.loadEarlierError && (
              <div className="mb-6" role="alert" data-testid="opencode-load-earlier-error">
                <Alert variant="danger">Could not load earlier messages: {stream.loadEarlierError}</Alert>
              </div>
            )}
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
                onExport={exportMessage}
              />
            )}
            {stream.running && (
              <div className="mt-6">
                <RunningIndicator activity={activity} />
              </div>
            )}
          </div>
        </div>

        <SessionInspector
          directory={directory}
          events={events}
          todos={stream.todos}
          todosLoaded={stream.todosLoaded}
          todosError={stream.todosError}
          mobileOpen={inspectorOpen}
          onMobileClose={() => setInspectorOpen(false)}
        />
      </div>

      <footer className="relative z-20 shrink-0 border-t border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <AgentModeToggle mode={mode} onChange={selectMode} testId="opencode-composer-mode" />
            <ModelSelect
              catalogue={modelCatalogue}
              value={selectedModel}
              onChange={selectModel}
              testId="opencode-composer-model"
              label="Model"
            />
            <span className="basis-full text-[11px] text-[var(--color-text-muted)]" data-testid="opencode-current-model">
              {mode === "plan" ? "Read-only analysis" : "Can modify files"}
              {selectedModel ? ` · ${sameModel(selectedModel, currentModel) ? "current" : "switches next message"}` : ""}
            </span>
          </div>
          {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attachments.map((attachment, index) => <button key={`${attachment.filename}-${index}`} type="button" onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-[var(--color-border-default)] px-2 py-1 text-xs" data-testid="opencode-attachment-chip">{attachment.filename} x</button>)}</div>}
          {attachments.length > 0 && selectedModelDetails && !selectedModelDetails.capabilities.image && (
            <p className="mb-2 text-xs text-[var(--color-text-warning)]" data-testid="opencode-model-image-warning">
              The selected model does not advertise image support.
            </p>
          )}
          {attachmentError && <p className="mb-2 text-xs text-[var(--color-text-danger)]" role="alert" data-testid="opencode-attachment-error">{attachmentError}</p>}
          {/* One card owns the border so the textarea and its controls share a
              frame. Laying the controls out on their own rail is what keeps
              them aligned: as flex siblings of the textarea they stretched to
              its height, while the fixed-height Send button did not. */}
          <div
            className="min-w-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] transition-colors focus-within:border-[var(--color-border-focus)]"
            data-testid="opencode-composer-card"
          >
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={submitOnEnter}
              onPaste={(event) => {
                const images = [...event.clipboardData.items]
                  .filter((item) => item.kind === "file")
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => file !== null);
                if (images.length) addAttachments(images);
              }}
              rows={1}
              enterKeyHint="enter"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Send a follow-up…"
              className="thin-scrollbar block max-h-64 min-h-24 w-full resize-none border-0 bg-transparent p-3 text-base text-[var(--color-text-default)] outline-none placeholder:text-[var(--color-text-muted)] sm:min-h-16 sm:p-2.5 sm:text-sm"
              data-testid="opencode-composer"
            />
            {/* Kept deliberately short: a session showing the auto-permission,
                interrupted, permission and question banners at once leaves the
                transcript only a sliver of a 720px viewport, so every pixel the
                footer takes comes straight out of readable transcript. */}
            <div className="flex min-w-0 items-center gap-2 border-t border-[var(--color-border-default)] px-2 py-2 sm:py-1">
              <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-md px-2.5 text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--hh-row-hover)] hover:text-[var(--color-text-default)] sm:min-h-8" data-testid="opencode-attach-label">
                Attach
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="sr-only" data-testid="opencode-attach" onChange={(event) => {
                  addAttachments(event.target.files ?? []);
                  event.target.value = "";
                }} />
              </label>
              {reminderCatalogue.length > 0 && (
                <select
                  value={selectedReminder}
                  onChange={(event) => setSelectedReminder(event.target.value)}
                  className={`min-h-11 min-w-0 max-w-36 shrink rounded-md border px-2 text-base sm:min-h-8 sm:max-w-40 sm:text-xs ${
                    selectedReminder
                      ? "border-[var(--color-border-focus)] bg-[var(--color-background-surface)] text-[var(--color-text-default)]"
                      : "border-transparent bg-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]"
                  }`}
                  data-testid="composer-reminder-select"
                  aria-label="Attach a reminder to this message"
                  title="Attach one reminder to the next message only. Cleared after sending."
                >
                  <option value="">+ reminder</option>
                  {reminderCatalogue.map((reminder) => (
                    <option key={reminder.id} value={reminder.id} title={reminder.description}>
                      {reminder.title}{reminder.triggers.length ? " (triggers ignored)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <span className="flex-1" aria-hidden="true" />
              <Button size="sm" className="min-h-11 shrink-0 sm:min-h-8" onClick={() => void send()} disabled={sending || !draft.trim()} data-testid="opencode-send">
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </footer>
      {workspaceOpen && <WorkspacePanels directory={directory} onClose={() => setWorkspaceOpen(false)} />}
      {shareTarget && session && (
        <ShareExportDialog
          directory={directory}
          sessionID={id}
          title={session?.title ?? "Session"}
          events={events}
          target={shareTarget}
          session={session}
          onSessionChange={setSession}
          onClose={() => setShareTarget(null)}
        />
      )}
    </main>
  );
}
