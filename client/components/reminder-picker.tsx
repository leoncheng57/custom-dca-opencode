import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRightLeft, Bird, BookOpen, Check, ChevronDown, Circle, ExternalLink, FileText, GitFork, ListChecks, MessageCircleQuestion, Search, Send, Waves, X, type LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import type { ReminderSummary } from "../lib/api.js";

const LISTBOX_ID = "composer-reminder-listbox";

const REMINDER_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: "Plan & Design", ids: ["grill-me", "build-waves"] },
  { label: "Research & Evidence", ids: ["deep-research-subagents", "parallel-research-handoff", "cite-file-lines"] },
  { label: "Delegate & Parallelize", ids: ["background-subagent", "session-handoff", "native-worktree-subagents"] },
  { label: "Documentation & Delivery", ids: ["docs-and-diagram-tooling", "ascii-diagrams", "human-verification-steps"] },
  { label: "Examples / Display", ids: ["duck-mode"] },
];

const REMINDER_ICONS: Record<string, LucideIcon> = {
  "grill-me": MessageCircleQuestion,
  "build-waves": Waves,
  "deep-research-subagents": Search,
  "parallel-research-handoff": Send,
  "cite-file-lines": FileText,
  "background-subagent": Send,
  "session-handoff": ArrowRightLeft,
  "native-worktree-subagents": GitFork,
  "docs-and-diagram-tooling": BookOpen,
  "ascii-diagrams": FileText,
  "human-verification-steps": ListChecks,
  "duck-mode": Bird,
};

function matches(reminder: ReminderSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || `${reminder.title} ${reminder.description}`.toLowerCase().includes(needle);
}

export function ReminderPicker({
  catalogue,
  value,
  onChange,
}: {
  catalogue: ReminderSummary[];
  value: string;
  onChange: (reminder: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = catalogue.find((reminder) => reminder.id === value);
  const visibleGroups = REMINDER_GROUPS.map(({ label, ids }) => ({
    label,
    reminders: ids.map((id) => catalogue.find((reminder) => reminder.id === id)).filter((reminder): reminder is ReminderSummary => Boolean(reminder && matches(reminder, query))),
  })).filter(({ reminders }) => reminders.length > 0);
  const groupedIDs = new Set(REMINDER_GROUPS.flatMap(({ ids }) => ids));
  const otherReminders = catalogue.filter((reminder) => !groupedIDs.has(reminder.id) && matches(reminder, query));
  if (otherReminders.length) visibleGroups.push({ label: "Other", reminders: otherReminders });
  const visible = visibleGroups.flatMap(({ reminders }) => reminders);
  const options: Array<ReminderSummary | null> = [null, ...visible];

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setActive(Math.max(0, visible.findIndex((reminder) => reminder.id === value) + 1));
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
  const choose = (reminder: ReminderSummary | null) => {
    onChange(reminder?.id ?? "");
    close();
  };
  const activeOption = options[active];
  const activeID = activeOption ? `composer-reminder-option-${activeOption.id}` : "composer-reminder-option-none";
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
        selected
          ? "border-[var(--color-border-focus)] bg-[var(--color-background-surface)] text-[var(--color-text-default)]"
          : "border-transparent bg-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]"
      }`}
      data-testid="composer-reminder-select"
      aria-label="Attach a reminder to this message"
      aria-haspopup="dialog"
      aria-expanded={open}
      title={selected ? `${selected.title}\n\n${selected.description}` : "Attach one reminder to the next message only. Cleared after sending."}
      value={value}
    >
      {selected && <ReminderIcon reminder={selected} />}
      <span className="min-w-0 flex-1 truncate">{selected?.title ?? "+ reminder"}</span>
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </button>
    {open && createPortal(
      <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:p-4 sm:pt-[10vh]" data-testid="composer-reminder-panel">
        <button type="button" aria-label="Close reminder picker" className="absolute inset-0 bg-[var(--color-background-overlay)]" onClick={close} data-testid="composer-reminder-backdrop" />
        <div className="relative flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl sm:max-h-[72vh] sm:max-w-2xl sm:rounded-xl" role="dialog" aria-modal="true" aria-label="Reminder picker" onKeyDown={handleKeyDown}>
          <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] p-3">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reminders"
                className="h-11 w-full rounded-md border border-[var(--color-border-default)] bg-transparent pl-9 pr-3 text-base text-[var(--color-text-default)] outline-none sm:h-9 sm:text-sm"
                data-testid="composer-reminder-search"
                role="combobox"
                aria-label="Search reminders"
                aria-controls={LISTBOX_ID}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={activeID}
              />
            </div>
            <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--hh-row-hover)] sm:h-9 sm:w-9" aria-label="Close reminder picker" data-testid="composer-reminder-close"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2" id={LISTBOX_ID} ref={listRef} role="listbox" aria-label="Reminders">
            <button
              type="button"
              id="composer-reminder-option-none"
              role="option"
              aria-selected={!value}
              data-active={active === 0}
              data-testid="composer-reminder-option-none"
              onClick={() => choose(null)}
              onMouseMove={() => setActive(0)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${active === 0 ? "bg-[var(--color-background-surface-neutral-muted)]" : "hover:bg-[var(--hh-row-hover)]"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--color-text-default)]">No reminder</span>
                <span className="block text-xs text-[var(--color-text-muted)]">Send this message without additional instructions.</span>
              </span>
              {!value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--color-text-info)]" />}
            </button>
            {visibleGroups.map(({ label, reminders }) => <section key={label} role="group" aria-label={label} className="mb-4 last:mb-0" data-testid="composer-reminder-group">
              <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--color-text-muted)]">{label}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {reminders.map((reminder) => {
                const optionIndex = visible.indexOf(reminder) + 1;
                const isActive = active === optionIndex;
                const isSelected = value === reminder.id;
                return <div key={reminder.id} className={`relative flex min-h-14 min-w-0 overflow-hidden rounded-lg border ${isActive ? "border-[var(--color-border-focus)] bg-[var(--color-background-surface-neutral-muted)]" : "border-[var(--color-border-default)] hover:bg-[var(--hh-row-hover)]"}`} data-testid="composer-reminder-tile" data-reminder-id={reminder.id}>
                  <button
                type="button"
                id={`composer-reminder-option-${reminder.id}`}
                role="option"
                aria-selected={isSelected}
                aria-label={`Attach ${reminder.title}`}
                aria-description={reminder.description}
                data-active={isActive}
                data-reminder-id={reminder.id}
                data-testid="composer-reminder-option"
                onClick={() => choose(reminder)}
                onMouseMove={() => setActive(optionIndex)}
                className="flex min-h-14 w-11 shrink-0 items-center justify-center border-r border-[var(--color-border-default)]"
              >
                <ReminderIcon reminder={reminder} />
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-1 px-2">
                    <span className="line-clamp-2 min-w-0 flex-1 text-left text-xs font-medium leading-4 text-[var(--color-text-default)]" data-testid="composer-reminder-title">{reminder.title}</span>
                    <Link
                      to={`/playbooks/skills/${reminder.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-text-link)] hover:bg-[var(--hh-row-hover)]"
                      data-testid="composer-reminder-details"
                      data-reminder-id={reminder.id}
                      aria-label={`Open ${reminder.title} details in a new tab`}
                    >
                      <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    </Link>
                  </div>
                {isSelected && <Check aria-hidden="true" className="pointer-events-none absolute right-1 top-1 h-3.5 w-3.5 text-[var(--color-text-info)]" />}
                </div>;
              })}
              </div>
            </section>)}
            {visible.length === 0 && <p className="px-3 py-10 text-center text-sm text-[var(--color-text-muted)]" data-testid="composer-reminder-empty">No matching reminders</p>}
          </div>
          <p className="shrink-0 border-t border-[var(--color-border-default)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] text-[var(--color-text-muted)]" aria-live="polite">One reminder applies to the next message only. Up/Down to navigate - Enter to select - Esc to close</p>
        </div>
      </div>,
      document.body,
    )}
  </div>;
}

function ReminderIcon({ reminder }: { reminder: ReminderSummary }) {
  const Icon = REMINDER_ICONS[reminder.id] ?? Circle;
  return <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)] text-[var(--color-text-default)]" title={`${reminder.title} symbol`} data-testid="composer-reminder-icon">
    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
  </span>;
}
