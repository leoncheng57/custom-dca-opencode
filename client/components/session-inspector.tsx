import { useEffect, useMemo, useState } from "react";

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

export function SessionInspector({ events, todos }: SessionInspectorProps) {
  const commands = useMemo(() => extractCommands(events), [events]);
  const links = useMemo(() => extractMrUrls(events), [events]);
  const [tab, setTab] = useState<InspectorTab>("tasks");

  return (
    <aside
      className="hidden w-80 shrink-0 overflow-y-auto border-l border-[var(--color-border-default)] lg:block"
      aria-label="Session details"
      data-testid="opencode-session-inspector"
    >
      <nav className="sticky top-0 z-10 flex border-b border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-1">
        {(["tasks", "commands", "links"] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={`flex-1 rounded px-2 py-1.5 text-xs capitalize ${
              tab === name
                ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold"
                : "text-[var(--color-text-muted)]"
            }`}
            onClick={() => setTab(name)}
            data-testid={`opencode-inspector-${name}`}
          >
            {name}
            {name === "tasks" && todos.length ? ` ${todos.length}` : ""}
            {name === "commands" && commands.length ? ` ${commands.length}` : ""}
            {name === "links" && links.length ? ` ${links.length}` : ""}
          </button>
        ))}
      </nav>

      <div className="p-4">
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
                      className="w-full rounded border border-[var(--color-border-default)] p-2 text-left hover:bg-[var(--hh-row-hover)]"
                      onClick={() => jumpToEvent(command.id)}
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
    </aside>
  );
}
