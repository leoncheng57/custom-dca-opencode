import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../ds/button.js";
import {
  extractCommands,
  extractMrUrls,
  formatClockTime,
  type CommandEntry,
} from "../lib/derive.js";
import type { Todo } from "../lib/api.js";
import type { TranscriptEvent } from "../lib/transcript.js";
import { api, type ReviewStatus } from "../lib/api.js";

type InspectorTab = "tasks" | "commands" | "links";

interface SessionInspectorProps {
  events: TranscriptEvent[];
  todos: Todo[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function exportCommands(commands: CommandEntry[]): void {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    ...commands
      .filter((command) => command.category === "command")
      .flatMap((command) => [`# ${command.status} at ${command.timestamp}`, command.text, ""]),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/x-shellscript" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "session-commands.sh";
  link.click();
  URL.revokeObjectURL(url);
}

function jumpToEvent(id: string): void {
  const row = document.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`);
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
  row?.focus({ preventScroll: true });
}

function ReviewLink({ url }: { url: string }) {
  const [review, setReview] = useState<ReviewStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api.review(url).then((result) => setReview(result.review)).catch((reason: Error) => setError(reason.message));
  }, [url]);
  return (
    <div className="rounded border border-[var(--color-border-default)] p-2" data-testid="opencode-merge-request-link">
      <a href={url} target="_blank" rel="noreferrer" className="block break-all text-xs font-semibold underline">
        {review?.title ?? url}
      </a>
      {review ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <span>{review.forge}</span><span>{review.state}</span><span>{review.author}</span>
          {review.pipeline && <span>pipeline {review.pipeline}</span>}
          {review.mergeable && review.state === "open" && (
            <Button size="sm" variant="secondary" disabled={!review.headSha} onClick={() => { if (window.confirm(`Merge ${review.title} at ${review.headSha.slice(0, 8)}?`)) void api.mergeReview(url, review.headSha).then(() => setReview({ ...review, state: "merged", mergeable: false })).catch((reason: Error) => setError(reason.message)); }} data-testid="opencode-merge-review">Merge</Button>
          )}
        </div>
      ) : error ? <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Live status unavailable</p> : <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Loading status...</p>}
    </div>
  );
}

function InspectorContent({
  commands,
  links,
  todos,
  tab,
  onTabChange,
  onJump,
}: {
  commands: CommandEntry[];
  links: string[];
  todos: Todo[];
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onJump: (id: string) => void;
}) {
  return (
    <>
      <nav className="sticky top-0 z-10 flex border-b border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-1">
        {(["tasks", "commands", "links"] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={`min-h-11 flex-1 rounded px-2 py-1.5 text-xs capitalize lg:min-h-0 ${
              tab === name
                ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold"
                : "text-[var(--color-text-muted)]"
            }`}
            onClick={() => onTabChange(name)}
            data-testid={`opencode-inspector-${name}`}
          >
            {name === "links" ? "Reviews" : name}
            {name === "tasks" && todos.length ? ` ${todos.length}` : ""}
            {name === "commands" && commands.length ? ` ${commands.length}` : ""}
            {name === "links" && links.length ? ` ${links.length}` : ""}
          </button>
        ))}
      </nav>

      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tab === "tasks" && (
          <section data-testid="opencode-task-list">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              Task list - {todos.filter((todo) => todo.status === "completed").length}/{todos.length} done
            </h2>
            {todos.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No tasks reported.</p>
            ) : (
              <ul className="space-y-1.5">
                {todos.map((todo, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm" data-status={todo.status}>
                    <span aria-hidden className="mt-0.5 shrink-0">
                      {todo.status === "completed" ? "[x]" : todo.status === "in_progress" ? "[~]" : "[ ]"}
                    </span>
                    <span className={todo.status === "completed" ? "text-[var(--color-text-muted)] line-through" : ""}>
                      {todo.content}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "commands" && (
          <section data-testid="opencode-command-list">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                Tool audit
              </h2>
              <Button
                size="sm"
                variant="secondary"
                disabled={!commands.some((command) => command.category === "command")}
                onClick={() => exportCommands(commands)}
                data-testid="opencode-export-commands"
              >
                Export .sh
              </Button>
            </div>
            {commands.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No tool calls yet.</p>
            ) : (
              <ol className="space-y-2">
                {commands.map((command) => (
                  <li key={command.id}>
                    <button
                      type="button"
                      className="min-h-11 w-full rounded border border-[var(--color-border-default)] p-2 text-left hover:bg-[var(--hh-row-hover)]"
                      onClick={() => onJump(command.id)}
                      data-testid="opencode-command-row"
                    >
                      <span className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                        <span>{command.category}</span>
                        <span>{command.status}</span>
                        <time className="ml-auto">{formatClockTime(command.timestamp)}</time>
                      </span>
                      <code className="mt-1 block truncate text-xs">{command.text}</code>
                      {command.outputPreview && (
                        <span className="mt-1 block truncate text-[11px] text-[var(--color-text-muted)]">
                          {command.outputPreview}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {tab === "links" && (
          <section data-testid="opencode-merge-request-list">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              Merge requests and pull requests
            </h2>
            {links.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No review links mentioned.</p>
            ) : (
              <ul className="space-y-2">
                {links.map((url) => (
                  <li key={url}>
                    <ReviewLink url={url} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function MobileInspector({ onClose, children }: { onClose: () => void; children: (close: () => void) => React.ReactNode }) {
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef<HTMLElement>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!(window.history.state as { opencodeInspector?: boolean } | null)?.opencodeInspector) {
      window.history.pushState({ opencodeInspector: true }, "");
    }
    const onPopState = () => onCloseRef.current();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const close = useCallback(() => {
    if ((window.history.state as { opencodeInspector?: boolean } | null)?.opencodeInspector) window.history.back();
    else onCloseRef.current();
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [close]);

  return (
    <div className="lg:hidden">
      <button type="button" className="fixed inset-0 z-50 bg-black/40" aria-label="Close session details" onClick={close} data-testid="opencode-mobile-inspector-scrim" />
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex min-w-0 flex-col overflow-hidden rounded-t-2xl border-t border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Session details"
        data-testid="opencode-mobile-inspector"
      >
        <header className="flex min-h-11 shrink-0 items-center border-b border-[var(--color-border-default)] px-3">
          <h2 className="text-sm font-semibold">Session details</h2>
          <button type="button" className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded text-sm" onClick={close} data-testid="opencode-mobile-inspector-close" aria-label="Close session details">Close</button>
        </header>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">{children(close)}</div>
      </section>
    </div>
  );
}

export function SessionInspector({ events, todos, mobileOpen = false, onMobileClose }: SessionInspectorProps) {
  const commands = useMemo(() => extractCommands(events), [events]);
  const links = useMemo(() => extractMrUrls(events), [events]);
  const [tab, setTab] = useState<InspectorTab>("tasks");

  const content = (onJump: (id: string) => void) => (
    <InspectorContent commands={commands} links={links} todos={todos} tab={tab} onTabChange={setTab} onJump={onJump} />
  );

  return (
    <>
      <aside
        className="hidden w-80 shrink-0 overflow-y-auto border-l border-[var(--color-border-default)] lg:block"
        aria-label="Session details"
        data-testid="opencode-session-inspector"
      >
        {content(jumpToEvent)}
      </aside>
      {mobileOpen && onMobileClose && (
        <MobileInspector onClose={onMobileClose}>
          {(close) => content((eventId) => {
            close();
            setTimeout(() => jumpToEvent(eventId), 0);
          })}
        </MobileInspector>
      )}
    </>
  );
}
