import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Circle, GitPullRequest, Image, MessageSquareText, MonitorCheck, Search, Send, Split, SquarePlus, X, type LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";

import type { WorkflowSummary } from "../lib/api.js";
import { groupWorkflows } from "../lib/workflows.js";

const LISTBOX_ID = "composer-workflow-listbox";

function matches(workflow: WorkflowSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || `${workflow.title} ${workflow.description} ${workflow.id}`.toLowerCase().includes(needle);
}

const WORKFLOW_ICONS: Record<string, LucideIcon> = {
  "playwright-ui-review": MonitorCheck,
  "pr-snippet-review": GitPullRequest,
  "session-update": MessageSquareText,
  "managed-child": Split,
  "start-dca-session": SquarePlus,
  "design-doc-prototype": Image,
};

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
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const attachedWorkflow = catalogue.find((workflow) => workflow.id === attached);
  const groupedWorkflows = groupWorkflows(catalogue)
    .map(({ label, workflows }) => ({ label, workflows: workflows.filter((workflow) => matches(workflow, query)) }))
    .filter(({ workflows }) => workflows.length > 0);
  const visibleWorkflows = groupedWorkflows.flatMap(({ workflows }) => workflows);
  // The detach row only exists while something is attached; a "no workflow"
  // placeholder would suggest workflows are a mode rather than an action.
  const options: Array<WorkflowSummary | null> = attachedWorkflow ? [null, ...visibleWorkflows] : [...visibleWorkflows];

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setActive(0);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.body.style.overflow = overflow;
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (workflow: WorkflowSummary | null) => {
    close();
    if (workflow) onPick(workflow);
    else onDetach();
  };
  const activeOption = options[active];
  const activeID = activeOption ? `composer-workflow-option-${activeOption.id}` : "composer-workflow-option-none";
  const move = (delta: number) => {
    // Unlike the reminder picker there is no unconditional sentinel row, so a
    // query that matches nothing empties `options` entirely and the modulo
    // would divide by zero.
    if (options.length === 0) return;
    setActive((index) => (index + delta + options.length) % options.length);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Escape": event.preventDefault(); close(); break;
      case "ArrowDown": event.preventDefault(); move(1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Home": event.preventDefault(); setActive(0); break;
      case "End": event.preventDefault(); if (options.length) setActive(options.length - 1); break;
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
      {attachedWorkflow && <WorkflowIcon workflow={attachedWorkflow} />}
      <span className="min-w-0 flex-1 truncate">{attachedWorkflow?.title ?? "Workflows"}</span>
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </button>
    {open && createPortal(
      <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:p-4 sm:pt-[10vh]" data-testid="composer-workflow-panel">
        <button type="button" aria-label="Close workflow picker" className="absolute inset-0 bg-[var(--color-background-overlay)]" onClick={close} data-testid="composer-workflow-backdrop" />
        <div className="relative flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl sm:max-h-[72vh] sm:max-w-2xl sm:rounded-xl" role="dialog" aria-modal="true" aria-label="Workflow picker" onKeyDown={handleKeyDown}>
          <div className="flex flex-col gap-2 border-b border-[var(--color-border-default)] p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Workflows</h2>
                <p className="text-xs text-[var(--color-text-muted)]">Choosing a workflow opens a form. Nothing is sent or launched until you confirm.</p>
              </div>
              <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--hh-row-hover)] sm:h-9 sm:w-9" aria-label="Close workflow picker" data-testid="composer-workflow-close"><X aria-hidden="true" className="h-4 w-4" /></button>
            </div>
            <div className="relative min-w-0">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search workflows"
                className="h-11 w-full rounded-md border border-[var(--color-border-default)] bg-transparent pl-9 pr-3 text-base text-[var(--color-text-default)] outline-none sm:h-9 sm:text-sm"
                data-testid="composer-workflow-search"
                role="combobox"
                aria-label="Search workflows"
                aria-controls={LISTBOX_ID}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={activeID}
              />
            </div>
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
            {groupedWorkflows.map(({ label, workflows }) => <section key={label} role="group" aria-label={label} className="mb-3 last:mb-0" data-testid="composer-workflow-group">
              <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">{label}</h3>
              {workflows.map((workflow) => {
                const optionIndex = visibleWorkflows.indexOf(workflow) + (attachedWorkflow ? 1 : 0);
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
                <WorkflowIcon workflow={workflow} />
                <span className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-[var(--color-text-default)]">{workflow.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">{workflow.description}</span>
                </span>
                {isAttached && <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-info)]" />}
              </button>;
              })}
            </section>)}
            {visibleWorkflows.length === 0 && <p className="px-3 py-10 text-center text-sm text-[var(--color-text-muted)]" data-testid="composer-workflow-empty">No matching workflows</p>}
          </div>
          <p className="shrink-0 border-t border-[var(--color-border-default)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] text-[var(--color-text-muted)]" aria-live="polite">Up/Down to navigate - Enter to open the form - Esc to close</p>
        </div>
      </div>,
      document.body,
    )}
  </div>;
}

function WorkflowIcon({ workflow }: { workflow: WorkflowSummary }) {
  const Icon = WORKFLOW_ICONS[workflow.id] ?? Circle;
  return <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)] text-[var(--color-text-default)]" title={`${workflow.title} symbol`} data-testid="composer-workflow-icon">
    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
  </span>;
}
