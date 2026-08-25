import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { createPortal } from "react-dom";

import type { WorkflowSummary } from "../lib/api.js";

const LISTBOX_ID = "composer-workflow-listbox";

/**
 * The composer's Workflows entry point (issue #167). Choosing a workflow only
 * OPENS its form — nothing is ever sent or launched from this picker. The
 * "attached" value names a workflow whose trusted injector will ride the next
 * composer send (set by the form's explicit "Apply to composer"), mirroring
 * how the reminder picker displays its per-message selection.
 */
export function WorkflowPicker({
  catalogue,
  attached,
  onDetach,
  onPick,
}: {
  catalogue: WorkflowSummary[];
  attached: string;
  onDetach: () => void;
  onPick: (workflow: WorkflowSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const attachedWorkflow = catalogue.find((workflow) => workflow.id === attached);
  // The detach row only exists while something is attached; a "no workflow"
  // placeholder would suggest workflows are a mode rather than an action.
  const options: Array<WorkflowSummary | null> = attachedWorkflow ? [null, ...catalogue] : [...catalogue];

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setActive(0);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.focus());
    return () => {
      document.body.style.overflow = overflow;
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const close = () => setOpen(false);
  const choose = (workflow: WorkflowSummary | null) => {
    close();
    if (workflow) onPick(workflow);
    else onDetach();
  };
  const activeOption = options[active];
  const activeID = activeOption ? `composer-workflow-option-${activeOption.id}` : "composer-workflow-option-none";
  const move = (delta: number) => {
    setActive((index) => (index + delta + options.length) % options.length);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Escape": event.preventDefault(); close(); break;
      case "ArrowDown": event.preventDefault(); move(1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Home": event.preventDefault(); setActive(0); break;
      case "End": event.preventDefault(); setActive(options.length - 1); break;
      case "Enter": event.preventDefault(); choose(activeOption ?? null); break;
    }
  };

  return <div className="min-w-0 shrink">
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(true)}
      className={`flex min-h-11 min-w-0 max-w-56 items-center gap-1.5 rounded-md border px-2.5 text-left text-sm sm:min-h-8 sm:text-xs ${
        attachedWorkflow
          ? "border-[var(--color-border-focus)] bg-[var(--color-background-surface)] text-[var(--color-text-default)]"
          : "border-transparent bg-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]"
      }`}
      data-testid="composer-workflow-select"
      aria-label="Run a guided workflow"
      aria-haspopup="dialog"
      aria-expanded={open}
      title={attachedWorkflow
        ? `${attachedWorkflow.title}\n\nIts trusted injector rides the next send. Choose "Detach workflow" to remove it.`
        : "Guided, explicit actions. Choosing one opens a form; nothing is sent or launched until you confirm."}
      value={attached}
    >
      <span className="min-w-0 flex-1 truncate">{attachedWorkflow?.title ?? "Workflows"}</span>
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </button>
    {open && createPortal(
      <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:p-4 sm:pt-[10vh]" data-testid="composer-workflow-panel">
        <button type="button" aria-label="Close workflow picker" className="absolute inset-0 bg-[var(--color-background-overlay)]" onClick={close} data-testid="composer-workflow-backdrop" />
        <div className="relative flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl sm:max-h-[72vh] sm:max-w-2xl sm:rounded-xl" role="dialog" aria-modal="true" aria-label="Workflow picker" onKeyDown={handleKeyDown}>
          <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] p-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Workflows</h2>
              <p className="text-xs text-[var(--color-text-muted)]">Choosing a workflow opens a form. Nothing is sent or launched until you confirm.</p>
            </div>
            <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--hh-row-hover)] sm:h-9 sm:w-9" aria-label="Close workflow picker" data-testid="composer-workflow-close"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2" id={LISTBOX_ID} ref={listRef} role="listbox" aria-label="Workflows" aria-activedescendant={activeID}>
            {attachedWorkflow && (
              <button
                type="button"
                id="composer-workflow-option-none"
                role="option"
                aria-selected={false}
                data-active={active === 0}
                data-testid="composer-workflow-option-none"
                onClick={() => choose(null)}
                onMouseMove={() => setActive(0)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${active === 0 ? "bg-[var(--color-background-surface-neutral-muted)]" : "hover:bg-[var(--hh-row-hover)]"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--color-text-default)]">Detach workflow</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">Send the next message without the "{attachedWorkflow.title}" injector.</span>
                </span>
              </button>
            )}
            {catalogue.map((workflow, index) => {
              const optionIndex = attachedWorkflow ? index + 1 : index;
              const isActive = active === optionIndex;
              const isAttached = attached === workflow.id;
              return <button
                type="button"
                id={`composer-workflow-option-${workflow.id}`}
                key={workflow.id}
                role="option"
                aria-selected={isAttached}
                data-active={isActive}
                data-workflow-id={workflow.id}
                data-testid="composer-workflow-option"
                onClick={() => choose(workflow)}
                onMouseMove={() => setActive(optionIndex)}
                className={`flex min-h-16 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left ${isActive ? "bg-[var(--color-background-surface-neutral-muted)]" : "hover:bg-[var(--hh-row-hover)]"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-[var(--color-text-default)]">{workflow.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">{workflow.description}</span>
                </span>
                {isAttached && <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-info)]" />}
              </button>;
            })}
          </div>
          <p className="shrink-0 border-t border-[var(--color-border-default)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] text-[var(--color-text-muted)]" aria-live="polite">Up/Down to navigate - Enter to open the form - Esc to close</p>
        </div>
      </div>,
      document.body,
    )}
  </div>;
}
