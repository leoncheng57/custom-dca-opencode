import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { createPortal } from "react-dom";

import { Badge } from "../ds/badge.js";
import type { ReminderSummary } from "../lib/api.js";

const LISTBOX_ID = "composer-reminder-listbox";

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
  const visible = catalogue.filter((reminder) => matches(reminder, query));
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
            {visible.map((reminder, index) => {
              const optionIndex = index + 1;
              const isActive = active === optionIndex;
              const isSelected = value === reminder.id;
              return <button
                type="button"
                id={`composer-reminder-option-${reminder.id}`}
                key={reminder.id}
                role="option"
                aria-selected={isSelected}
                data-active={isActive}
                data-reminder-id={reminder.id}
                data-testid="composer-reminder-option"
                onClick={() => choose(reminder)}
                onMouseMove={() => setActive(optionIndex)}
                className={`flex min-h-16 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left ${isActive ? "bg-[var(--color-background-surface-neutral-muted)]" : "hover:bg-[var(--hh-row-hover)]"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-[var(--color-text-default)]">{reminder.title}</span>
                    {reminder.triggers.length > 0 && <Badge variant="warning" className="shrink-0 px-1.5 py-0 text-[9px]">Triggers ignored</Badge>}
                  </span>
                  <span className="mt-0.5 block max-h-10 overflow-hidden text-xs leading-5 text-[var(--color-text-muted)]" title={reminder.description}>{reminder.description}</span>
                </span>
                {isSelected && <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-info)]" />}
              </button>;
            })}
            {visible.length === 0 && <p className="px-3 py-10 text-center text-sm text-[var(--color-text-muted)]" data-testid="composer-reminder-empty">No matching reminders</p>}
          </div>
          <p className="shrink-0 border-t border-[var(--color-border-default)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] text-[var(--color-text-muted)]" aria-live="polite">One reminder applies to the next message only. Up/Down to navigate - Enter to select - Esc to close</p>
        </div>
      </div>,
      document.body,
    )}
  </div>;
}
