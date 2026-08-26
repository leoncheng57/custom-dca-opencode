import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import type { AgentMode } from "../lib/agentMode.js";
import { catalogueDefault, type ModelCatalogue, type ModelSelection } from "../lib/models.js";
import { ModelPicker } from "./model-picker.js";

export function ManagedChildDialog({
  open,
  catalogue,
  defaultModel,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  catalogue: ModelCatalogue | null;
  defaultModel?: ModelSelection;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { prompt: string; mode: AgentMode; model?: ModelSelection; idempotencyKey: string }) => Promise<unknown>;
}) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<AgentMode>("plan");
  const [model, setModel] = useState<ModelSelection | undefined>();
  const [confirmedBuild, setConfirmedBuild] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Reset only on the closed -> open transition. Catalogue refreshes while
  // typing must not erase the assignment.
  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setMode("plan");
    setModel(defaultModel ?? (catalogue ? catalogueDefault(catalogue) : undefined));
    setConfirmedBuild(false);
    setIdempotencyKey(crypto.randomUUID());
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => promptRef.current?.focus());
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || model) return;
    setModel(defaultModel ?? (catalogue ? catalogueDefault(catalogue) : undefined));
  }, [catalogue, defaultModel, model, open]);

  if (!open) return null;
  const canSubmit = prompt.trim().length > 0 && prompt.length <= 100_000 && Boolean(model) && Boolean(idempotencyKey)
    && (mode !== "build" || confirmedBuild) && !submitting;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4" data-testid="opencode-managed-child-dialog">
      <button type="button" className="absolute inset-0 bg-[var(--color-background-overlay)]" aria-label="Close managed child dialog" onClick={submitting ? undefined : onClose} />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="managed-child-title"
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-4 shadow-xl sm:max-w-xl sm:rounded-xl sm:p-5"
        onKeyDown={(event) => { if (event.key === "Escape" && !submitting) onClose(); }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="managed-child-title" className="text-lg font-semibold">Launch independent sub-agent</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              This human-authorized child uses its own mode and model, independent of the parent session.
            </p>
          </div>
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" disabled={submitting} onClick={onClose} data-testid="opencode-managed-child-close">Close</Button>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            void onSubmit({ prompt: prompt.trim(), mode, model, idempotencyKey }).then(onClose).catch(() => undefined);
          }}
        >
          <label className="block text-sm font-medium">
            Assignment
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              maxLength={100_000}
              placeholder="Describe the work this child should complete..."
              className="mt-1.5 min-h-36 w-full resize-y rounded-md border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-base leading-relaxed sm:text-sm"
              data-testid="opencode-managed-child-prompt"
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">Execution mode</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(["plan", "build"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${
                    mode === value
                      ? "border-[var(--color-border-info)] bg-[var(--color-background-surface-info-muted)] text-[var(--color-text-info)]"
                      : "border-[var(--color-border-default)] text-[var(--color-text-muted)]"
                  }`}
                  onClick={() => { setMode(value); if (value === "plan") setConfirmedBuild(false); }}
                  data-testid={`opencode-managed-child-mode-${value}`}
                >
                  {value === "plan" ? "Plan · read-only" : "Build · can modify"}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <p className="mb-1.5 text-sm font-medium">Model</p>
            <ModelPicker
              catalogue={catalogue}
              value={model}
              onChange={setModel}
              testId="opencode-managed-child-model"
              label="Sub-agent model"
              disabled={submitting}
              portalLayer="nested"
            />
          </div>

          {mode === "build" && (
            <label className="flex min-h-11 items-start gap-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface-warning-muted)] p-3 text-sm" data-testid="opencode-managed-child-build-confirmation">
              <input
                type="checkbox"
                checked={confirmedBuild}
                onChange={(event) => setConfirmedBuild(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0"
                data-testid="opencode-managed-child-build-confirm"
              />
              <span>This child may modify files even when the parent is in Plan. I am authorizing that independent Build access.</span>
            </label>
          )}

          {error && <Alert variant="danger">{error}</Alert>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border-default)] pt-4">
            <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="opencode-managed-child-submit">
              {submitting ? "Launching..." : "Launch sub-agent"}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
