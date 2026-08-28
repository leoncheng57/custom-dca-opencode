import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import {
  api,
  type ManagedChildAgent,
  type ManagedChildAgentSummary,
  type SessionSummary,
  type WorkflowSummary,
} from "../lib/api.js";
import type { AgentMode } from "../lib/agentMode.js";
import { catalogueDefault, type ModelCatalogue, type ModelSelection } from "../lib/models.js";
import {
  buildPlaywrightReviewPrompt,
  DESIGN_DOC_PROTOTYPE_PROMPT,
  DESIGN_DOC_PROTOTYPE_WORKFLOW_ID,
  MANAGED_CHILD_WORKFLOW_ID,
  PLAYWRIGHT_CAPTURE_SCOPES,
  PLAYWRIGHT_REVIEW_WORKFLOW_ID,
  PR_SNIPPET_REVIEW_WORKFLOW_ID,
  buildPrSnippetReviewPrompt,
  parsePullRequestNumber,
  SESSION_UPDATE_WORKFLOW_ID,
  type PlaywrightCaptureScope,
} from "../lib/workflows.js";
import { ModelPicker } from "./model-picker.js";

type Stage = "form" | "preview" | "done";

const fieldClass =
  "mt-1.5 w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-base leading-relaxed sm:text-sm";

/**
 * The workflow form + preview dialog (issue #167). Every workflow starts here
 * as a form; the ONLY paths out are Cancel, "Apply to composer" (which fills
 * the composer and never sends), or the explicit Send / Launch on the preview
 * stage. The preview always shows the exact generated prompt and the trusted
 * server-resolved injector before anything is submitted.
 */
export function WorkflowDialog({
  workflow,
  directory,
  sessionID,
  mode,
  modelCatalogue,
  defaultModel,
  onClose,
  onApplyToComposer,
  onSent,
}: {
  workflow: WorkflowSummary;
  directory: string;
  sessionID: string;
  /** The composer's current mode; used when sending to the current session. */
  mode: AgentMode;
  modelCatalogue: ModelCatalogue | null;
  defaultModel?: ModelSelection;
  onClose: () => void;
  onApplyToComposer: (draft: string, workflowID: string) => void;
  onSent: () => void;
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playwright review fields.
  const [pullRequest, setPullRequest] = useState("");
  const [route, setRoute] = useState("");
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<PlaywrightCaptureScope>("targeted-screenshots");

  // Session update fields.
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [targetID, setTargetID] = useState("");
  const [message, setMessage] = useState("");

  // Managed child fields. The agent comes from the server catalogue, never a
  // hardcoded pair: `explore` and `general` are equally valid Managed Child
  // agents, and only the catalogue knows which of them can modify files.
  const [objective, setObjective] = useState("");
  const [childAgent, setChildAgent] = useState<ManagedChildAgent>("plan");
  const [childAgents, setChildAgents] = useState<ManagedChildAgentSummary[]>([]);
  const [childAgentError, setChildAgentError] = useState<string | null>(null);
  const [childModel, setChildModel] = useState<ModelSelection | undefined>(
    () => defaultModel ?? (modelCatalogue ? catalogueDefault(modelCatalogue) : undefined),
  );
  const [confirmedBuild, setConfirmedBuild] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [child, setChild] = useState<SessionSummary | null>(null);

  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => (firstFieldRef.current ?? dialogRef.current)?.focus());
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (workflow.id !== SESSION_UPDATE_WORKFLOW_ID) return;
    let cancelled = false;
    api.sessions(directory)
      .then((result) => {
        if (cancelled) return;
        setSessions(result.sessions.filter((session) => session.id !== sessionID));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setSessionsError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [directory, sessionID, workflow.id]);

  useEffect(() => {
    if (workflow.id !== MANAGED_CHILD_WORKFLOW_ID) return;
    let cancelled = false;
    setChildAgents([]);
    setChildAgentError(null);
    api.managedChildAgents(directory)
      .then(({ agents }) => {
        if (cancelled) return;
        setChildAgents(agents);
        // Default to a read-only agent so the safe choice is never the one
        // that needs an authorization the human has not given yet.
        setChildAgent((current) => agents.some((agent) => agent.id === current)
          ? current
          : agents.find((agent) => agent.access === "read-only")?.id ?? agents[0]?.id ?? current);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setChildAgentError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [directory, workflow.id]);

  useEffect(() => {
    if (!childModel && modelCatalogue) setChildModel(defaultModel ?? catalogueDefault(modelCatalogue));
  }, [childModel, defaultModel, modelCatalogue]);

  const targetSession = sessions?.find((session) => session.id === targetID);
  // Send in the TARGET session's own mode: a hardcoded "build" would restore
  // write access to a session its owner left in Plan. A target whose agent is
  // neither plan nor build still 409s server-side, and that error is shown.
  const targetMode: AgentMode = targetSession?.agent === "plan" ? "plan" : "build";

  const selectedChildAgent = childAgents.find((agent) => agent.id === childAgent);
  // Authorization is derived from the catalogue's access, not from an agent id
  // spelled into this file: `general` can modify too, and a fourth agent added
  // upstream must not silently arrive unauthorized.
  const requiresChildAuthorization = selectedChildAgent?.access === "can-modify";
  const childAgentLabel = (agent: ManagedChildAgentSummary) =>
    `${agent.id[0].toUpperCase()}${agent.id.slice(1)} · ${agent.access}`;

  // Only the number survives parsing, so a pasted link from another repository
  // cannot redirect the review or the posted comment (see parsePullRequestNumber).
  const pullRequestNumber = parsePullRequestNumber(pullRequest);

  const generatedPrompt =
    workflow.id === PLAYWRIGHT_REVIEW_WORKFLOW_ID
      ? (route.trim() && target.trim() ? buildPlaywrightReviewPrompt({ route, target, scope }) : "")
      : workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID
        ? (pullRequestNumber === null ? "" : buildPrSnippetReviewPrompt(pullRequestNumber))
      : workflow.id === DESIGN_DOC_PROTOTYPE_WORKFLOW_ID
        ? DESIGN_DOC_PROTOTYPE_PROMPT
      : workflow.id === SESSION_UPDATE_WORKFLOW_ID
        ? message.trim()
        : objective.trim();

  const formValid =
    workflow.id === PLAYWRIGHT_REVIEW_WORKFLOW_ID
      ? Boolean(route.trim() && target.trim())
      : workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID
        ? pullRequestNumber !== null
      // Nothing is collected, so there is nothing to invalidate: the whole
      // procedure lives in the trusted injector shown on the next stage.
      : workflow.id === DESIGN_DOC_PROTOTYPE_WORKFLOW_ID
        ? true
      : workflow.id === SESSION_UPDATE_WORKFLOW_ID
        ? Boolean(targetSession && message.trim())
        // No catalogue means no verified agent, so there is nothing safe to launch.
        : Boolean(objective.trim() && objective.length <= 100_000 && childModel && selectedChildAgent);

  const confirmReady = formValid && !busy
    && (workflow.id !== MANAGED_CHILD_WORKFLOW_ID || !requiresChildAuthorization || confirmedBuild);

  const submit = async (action: "send" | "launch") => {
    setBusy(true);
    setError(null);
    try {
      if (
        workflow.id === PLAYWRIGHT_REVIEW_WORKFLOW_ID
        || workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID
        || workflow.id === DESIGN_DOC_PROTOTYPE_WORKFLOW_ID
      ) {
        // Sent in THIS session's current mode. Posting a comment is a write, so
        // a Plan session will be stopped by its own policy rather than having
        // write access quietly restored here (decision 9).
        await api.prompt(directory, sessionID, generatedPrompt, { mode }, undefined, undefined, undefined, workflow.id);
        onSent();
        onClose();
        return;
      }
      if (workflow.id === SESSION_UPDATE_WORKFLOW_ID) {
        if (!targetSession) return;
        await api.prompt(directory, targetSession.id, generatedPrompt, { mode: targetMode }, undefined, undefined, undefined, workflow.id);
        setStage("done");
        return;
      }
      if (action === "launch") {
        if (!selectedChildAgent) return;
        const result = await api.createManagedChild(directory, sessionID, {
          prompt: generatedPrompt,
          // The agent and its authorization both come from the server
          // catalogue, so every can-modify agent carries the explicit
          // authorization the confirmation checkbox above already gates.
          agent: selectedChildAgent.id,
          ...(requiresChildAuthorization ? { authorization: "modify" as const } : {}),
          model: childModel,
          idempotencyKey,
          workflow: workflow.id,
        });
        setChild(result.session);
        onSent();
        setStage("done");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const sessionLink = (id: string) => `/sessions/${encodeURIComponent(id)}?directory=${encodeURIComponent(directory)}`;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4" data-testid="composer-workflow-dialog" data-workflow={workflow.id}>
      <button type="button" className="absolute inset-0 bg-[var(--color-background-overlay)]" aria-label="Close workflow" onClick={busy ? undefined : onClose} data-testid="composer-workflow-scrim" />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-workflow-title"
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-4 shadow-xl sm:max-w-xl sm:rounded-xl sm:p-5"
        onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="composer-workflow-title" className="text-lg font-semibold">{workflow.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{workflow.description}</p>
          </div>
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" disabled={busy} onClick={onClose} data-testid="composer-workflow-close">Close</Button>
        </div>

        {stage === "form" && (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => { event.preventDefault(); if (formValid) setStage("preview"); }}
          >
            {workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID && (
              <label className="block text-sm font-medium">
                Pull request <span className="font-normal text-[var(--color-text-muted)]">(required)</span>
                <input
                  ref={(node) => { firstFieldRef.current = node; }}
                  type="text"
                  inputMode="numeric"
                  value={pullRequest}
                  onChange={(event) => setPullRequest(event.target.value)}
                  placeholder="253, #253, or a pull request URL"
                  className={fieldClass}
                  data-testid="composer-workflow-field-pull-request"
                />
                <span className="mt-1 block text-[11px] font-normal text-[var(--color-text-muted)]">
                  The repository comes from this project directory. A pasted URL contributes only its number.
                </span>
                {pullRequest.trim() && pullRequestNumber === null && (
                  <span className="mt-1 block text-[11px] font-normal text-[var(--color-text-danger)]" data-testid="composer-workflow-pull-request-invalid">
                    Enter a pull request number, like 253.
                  </span>
                )}
              </label>
            )}
            {workflow.id === PLAYWRIGHT_REVIEW_WORKFLOW_ID && <>
              <label className="block text-sm font-medium">
                Target route or component <span className="font-normal text-[var(--color-text-muted)]">(required)</span>
                <input
                  ref={(node) => { firstFieldRef.current = node; }}
                  type="text"
                  value={route}
                  onChange={(event) => setRoute(event.target.value)}
                  placeholder="/sessions/ses_123?directory=… or the composer card"
                  className={fieldClass}
                  data-testid="composer-workflow-field-route"
                />
              </label>
              <label className="block text-sm font-medium">
                Desired state or interaction <span className="font-normal text-[var(--color-text-muted)]">(required)</span>
                <textarea
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  rows={3}
                  placeholder="What should be true, or what should be exercised?"
                  className={`${fieldClass} min-h-20 resize-y`}
                  data-testid="composer-workflow-field-target"
                />
              </label>
              <label className="block text-sm font-medium">
                Capture scope <span className="font-normal text-[var(--color-text-muted)]">(default: targeted screenshots)</span>
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as PlaywrightCaptureScope)}
                  className={fieldClass}
                  data-testid="composer-workflow-field-scope"
                >
                  {PLAYWRIGHT_CAPTURE_SCOPES.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-[var(--color-text-muted)]">
                The review stays focused: no full deployment, no complete screenshot regeneration.
              </p>
            </>}

            {workflow.id === DESIGN_DOC_PROTOTYPE_WORKFLOW_ID && (
              // Deliberately no fields, and so no firstFieldRef: focus falls
              // back to the dialog itself, which is what the effect already does
              // when the ref is null.
              <p className="text-sm text-[var(--color-text-muted)]" data-testid="composer-workflow-no-fields">
                No input needed. Confirm to preview the exact prompt and trusted procedure below.
              </p>
            )}

            {workflow.id === SESSION_UPDATE_WORKFLOW_ID && <>
              <label className="block text-sm font-medium">
                Target session <span className="font-normal text-[var(--color-text-muted)]">(required)</span>
                <select
                  ref={(node) => { firstFieldRef.current = node; }}
                  value={targetID}
                  onChange={(event) => setTargetID(event.target.value)}
                  className={fieldClass}
                  data-testid="composer-workflow-field-session"
                >
                  <option value="">{sessions === null ? "Loading sessions…" : "Choose a session"}</option>
                  {(sessions ?? []).map((session) => (
                    <option key={session.id} value={session.id}>{session.title} ({session.id})</option>
                  ))}
                </select>
              </label>
              {sessionsError && <Alert variant="danger">Could not list sessions: {sessionsError}</Alert>}
              {sessions?.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">No other sessions exist in this project.</p>}
              <label className="block text-sm font-medium">
                Message <span className="font-normal text-[var(--color-text-muted)]">(required — sent exactly as written)</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  placeholder="The update to deliver to the target session…"
                  className={`${fieldClass} min-h-28 resize-y`}
                  data-testid="composer-workflow-field-message"
                />
              </label>
            </>}

            {workflow.id === MANAGED_CHILD_WORKFLOW_ID && <>
              <label className="block text-sm font-medium">
                Objective <span className="font-normal text-[var(--color-text-muted)]">(required — becomes the child's first prompt)</span>
                <textarea
                  ref={(node) => { firstFieldRef.current = node; }}
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  rows={6}
                  maxLength={100_000}
                  placeholder="Describe the work this child should complete…"
                  className={`${fieldClass} min-h-32 resize-y`}
                  data-testid="composer-workflow-field-objective"
                />
              </label>
              <fieldset>
                <legend className="text-sm font-medium">Agent <span className="font-normal text-[var(--color-text-muted)]">(default: a read-only agent)</span></legend>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {childAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      aria-pressed={childAgent === agent.id}
                      className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${
                        childAgent === agent.id
                          ? "border-[var(--color-border-info)] bg-[var(--color-background-surface-info-muted)] text-[var(--color-text-info)]"
                          : "border-[var(--color-border-default)] text-[var(--color-text-muted)]"
                      }`}
                      // Changing the agent always clears the consent: an
                      // authorization given for one agent is not an
                      // authorization for the next one.
                      onClick={() => { setChildAgent(agent.id); setConfirmedBuild(false); }}
                      data-testid={`composer-workflow-mode-${agent.id}`}
                    >
                      {childAgentLabel(agent)}
                    </button>
                  ))}
                </div>
                {selectedChildAgent?.description && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]" data-testid="composer-workflow-agent-description">{selectedChildAgent.description}</p>
                )}
              </fieldset>
              {childAgentError && (
                <Alert variant="danger" data-testid="composer-workflow-agent-error">Agent catalogue unavailable: {childAgentError}</Alert>
              )}
              <div>
                <p className="mb-1.5 text-sm font-medium">Model <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></p>
                <ModelPicker
                  catalogue={modelCatalogue}
                  value={childModel}
                  onChange={setChildModel}
                  testId="composer-workflow-model"
                  label="Child model"
                  disabled={busy}
                  // Without this the picker portals to z-[90] and renders
                  // BEHIND this z-[95] dialog; "nested" also inerts the parent.
                  portalLayer="nested"
                />
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--color-text-muted)]" data-testid="composer-workflow-managed-notes">
                <li>The child runs in its own independent transcript.</li>
                <li>Its Plan/Build policy is fixed at creation time.</li>
                <li>No native task card appears in this session.</li>
                <li>No automatic hand-back occurs — you read results in the child's transcript.</li>
              </ul>
            </>}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border-default)] pt-4">
              <Button type="button" variant="secondary" disabled={busy} onClick={onClose} data-testid="composer-workflow-cancel">Cancel</Button>
              <Button type="submit" disabled={!formValid || busy} data-testid="composer-workflow-preview">Preview and confirm</Button>
            </div>
          </form>
        )}

        {stage === "preview" && (
          <div className="mt-5 space-y-4">
            {workflow.id === SESSION_UPDATE_WORKFLOW_ID && targetSession && (
              <div className="rounded-md border border-[var(--color-border-default)] p-3 text-sm">
                <p className="font-medium" data-testid="composer-workflow-target-title">{targetSession.title}</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]" data-testid="composer-workflow-target-id">{targetSession.id}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Will be sent in {targetMode} mode (the target session's current mode).</p>
              </div>
            )}
            {workflow.id === MANAGED_CHILD_WORKFLOW_ID && (
              <div className="rounded-md border border-[var(--color-border-default)] p-3 text-xs text-[var(--color-text-muted)]">
                <p data-testid="composer-workflow-agent-summary"><span className="font-medium text-[var(--color-text-default)]">Agent:</span> {selectedChildAgent ? childAgentLabel(selectedChildAgent) : "unavailable"} (fixed at creation)</p>
                <p className="mt-1"><span className="font-medium text-[var(--color-text-default)]">Model:</span> {childModel ? `${childModel.providerID}/${childModel.modelID}${childModel.variant ? `/${childModel.variant}` : ""}` : "project default"}</p>
                <p className="mt-1">Independent transcript · no native task card · no automatic hand-back.</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium">Exact prompt</p>
              <pre className="thin-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-muted)] p-3 font-sans text-xs leading-relaxed" data-testid="composer-workflow-prompt-preview">{generatedPrompt}</pre>
            </div>
            <details open data-testid="composer-workflow-injector">
              <summary className="cursor-pointer text-sm font-medium">Trusted injector — server-resolved from id "{workflow.id}"</summary>
              <pre className="thin-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-border-default)] p-3 font-sans text-xs leading-relaxed text-[var(--color-text-muted)]">{workflow.injector}</pre>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Appended by the server exactly as shown. The browser only names the workflow id.</p>
            </details>
            {(workflow.id === PLAYWRIGHT_REVIEW_WORKFLOW_ID || workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID || workflow.id === DESIGN_DOC_PROTOTYPE_WORKFLOW_ID) && (
              <p className="text-xs text-[var(--color-text-muted)]">"Apply to composer" only fills the message box for further editing — nothing is sent until you press Send.</p>
            )}
            {workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID && (
              <p className="text-xs text-[var(--color-text-muted)]" data-testid="composer-workflow-post-note">
                This posts one comment on the pull request. Sent in this session's current mode, so a Plan session will stop at the write rather than post.
              </p>
            )}
            {workflow.id === SESSION_UPDATE_WORKFLOW_ID && (
              <p className="text-xs text-[var(--color-text-muted)]" data-testid="composer-workflow-accepted-note">Delivery is asynchronous: POST /session/{"{target}"}/prompt_async answers 204 for <strong>accepted</strong>, not completed.</p>
            )}
            {workflow.id === MANAGED_CHILD_WORKFLOW_ID && requiresChildAuthorization && (
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface-warning-muted)] p-3 text-sm" data-testid="composer-workflow-build-confirmation">
                <input
                  type="checkbox"
                  checked={confirmedBuild}
                  onChange={(event) => setConfirmedBuild(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0"
                  data-testid="composer-workflow-build-confirm"
                />
                <span>This child may modify files even when this session is in Plan. I am authorizing that independent {selectedChildAgent ? childAgentLabel(selectedChildAgent) : "modify"} access.</span>
              </label>
            )}
            {error && <Alert variant="danger" data-testid="composer-workflow-error">{error}</Alert>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border-default)] pt-4">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setError(null); setStage("form"); }} data-testid="composer-workflow-back">Back</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={onClose} data-testid="composer-workflow-cancel">Cancel</Button>
              {(workflow.id === PLAYWRIGHT_REVIEW_WORKFLOW_ID || workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID || workflow.id === DESIGN_DOC_PROTOTYPE_WORKFLOW_ID) && <>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => onApplyToComposer(generatedPrompt, workflow.id)} data-testid="composer-workflow-apply">Apply to composer</Button>
                <Button type="button" disabled={!confirmReady} onClick={() => void submit("send")} data-testid="composer-workflow-send">{busy ? "Sending…" : "Send"}</Button>
              </>}
              {workflow.id === SESSION_UPDATE_WORKFLOW_ID && (
                <Button type="button" disabled={!confirmReady} onClick={() => void submit("send")} data-testid="composer-workflow-send">{busy ? "Sending…" : "Send to session"}</Button>
              )}
              {workflow.id === MANAGED_CHILD_WORKFLOW_ID && (
                <Button type="button" disabled={!confirmReady} onClick={() => void submit("launch")} data-testid="composer-workflow-launch">{busy ? "Launching…" : "Launch Managed Child"}</Button>
              )}
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="mt-5 space-y-4" data-testid="composer-workflow-done">
            {workflow.id === SESSION_UPDATE_WORKFLOW_ID && targetSession && (
              <Alert variant="success">
                Update accepted by "{targetSession.title}" ({targetSession.id}). Accepted means queued, not completed — the target session works through it on its own time.
              </Alert>
            )}
            {workflow.id === MANAGED_CHILD_WORKFLOW_ID && child && (
              <Alert variant="success">
                Managed child launched: "{child.title}" ({child.id}). It runs in its own transcript with its policy fixed at creation; no task card was added here and no automatic hand-back will occur.
              </Alert>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border-default)] pt-4">
              {workflow.id === SESSION_UPDATE_WORKFLOW_ID && targetSession && (
                <Link to={sessionLink(targetSession.id)} className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-border-default)] px-3 text-sm underline-offset-2 hover:underline" data-testid="composer-workflow-open-session" onClick={onClose}>Open target session</Link>
              )}
              {workflow.id === MANAGED_CHILD_WORKFLOW_ID && child && (
                <Link to={sessionLink(child.id)} className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-border-default)] px-3 text-sm underline-offset-2 hover:underline" data-testid="composer-workflow-open-session" onClick={onClose}>Open child session</Link>
              )}
              <Button type="button" onClick={onClose} data-testid="composer-workflow-done-close">Close</Button>
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
