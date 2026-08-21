import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../ds/button.js";
import { Badge, type BadgeVariant } from "../ds/badge.js";
import {
  extractCommands,
  extractMrUrls,
  formatClockTime,
  type CommandEntry,
} from "../lib/derive.js";
import { api, type CatalogResponse, type McpStatus, type Todo } from "../lib/api.js";
import type { TranscriptEvent } from "../lib/transcript.js";
import { ReviewCard } from "./review-card.js";
import { Link } from "react-router-dom";

type InspectorTab = "todo" | "runlog" | "reviews" | "catalog";

interface SessionInspectorProps {
  directory: string;
  events: TranscriptEvent[];
  todos: Todo[];
  todosLoaded: boolean;
  todosError: string | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const TAB_LABELS: Record<InspectorTab, string> = {
  todo: "Todo",
  runlog: "Run log",
  reviews: "Reviews",
  catalog: "Catalog",
};

function statusVariant(status: string): BadgeVariant {
  if (status === "completed" || status === "connected") return "success";
  if (status === "failed") return "danger";
  if (status === "in_progress" || status === "needs_auth" || status === "needs_client_registration") return "warning";
  return "neutral";
}

function TodoPanel({ todos, loaded, error }: { todos: Todo[]; loaded: boolean; error: string | null }) {
  const completed = todos.filter((todo) => todo.status === "completed").length;
  return (
    <section data-testid="opencode-todo-list">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Session todo</h2>
        {loaded && <span className="text-xs text-[var(--color-text-muted)]">{completed}/{todos.length} done</span>}
      </div>
      {loaded && todos.length > 0 && (
        <progress className="mb-3 h-1.5 w-full accent-[var(--color-text-success)]" max={todos.length} value={completed} aria-label={`${completed} of ${todos.length} todos completed`} />
      )}
      {!loaded && <p className="text-sm text-[var(--color-text-muted)]" role="status">Loading todos...</p>}
      {error && <p className="mb-3 break-words text-sm text-[var(--color-text-danger)]" role="alert">Could not load todos: {error}</p>}
      {loaded && todos.length === 0 && !error && <p className="text-sm text-[var(--color-text-muted)]">No todos reported.</p>}
      {todos.length > 0 && (
        <ul className="space-y-2">
          {todos.map((todo, index) => (
            <li key={`${index}-${todo.content}`} className="min-w-0 rounded border border-[var(--color-border-default)] p-2.5" data-status={todo.status}>
              <div className="flex min-w-0 items-start gap-2">
                <span aria-hidden className="mt-0.5 shrink-0 text-xs">
                  {todo.status === "completed" ? "[x]" : todo.status === "in_progress" ? "[~]" : "[ ]"}
                </span>
                <span className={`min-w-0 flex-1 break-words text-sm ${todo.status === "completed" ? "text-[var(--color-text-muted)] line-through" : ""}`}>
                  {todo.content}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                <Badge variant={statusVariant(todo.status)} className="text-[9px]">{todo.status.replaceAll("_", " ")}</Badge>
                <Badge variant={todo.priority === "high" ? "danger" : todo.priority === "medium" ? "warning" : "neutral"} className="text-[9px]">{todo.priority} priority</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function McpBadge({ status }: { status: McpStatus }) {
  return <Badge variant={statusVariant(status.status)} className="shrink-0 text-[9px]">{status.status.replaceAll("_", " ")}</Badge>;
}

function CatalogPanel({ catalogue, loading, error, directory, onRefresh }: {
  catalogue: CatalogResponse | null;
  loading: boolean;
  error: string | null;
  directory: string;
  onRefresh: () => void;
}) {
  const servers = Object.entries(catalogue?.servers ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const connected = servers.filter(([, status]) => status.status === "connected").length;
  const toolsPath = `/tools?${new URLSearchParams({ directory })}`;
  return (
    <section className="space-y-5" data-testid="opencode-catalog">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">
          {catalogue ? `Refreshed ${new Date(catalogue.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Not loaded"}
        </span>
        <Button size="sm" variant="secondary" onClick={onRefresh} disabled={loading || !directory} data-testid="opencode-catalog-refresh">
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
      {loading && !catalogue && <p className="text-sm text-[var(--color-text-muted)]" role="status">Loading catalog...</p>}
      {error && <p className="break-words text-sm text-[var(--color-text-danger)]" role="alert">Catalog unavailable: {error}</p>}
      {catalogue && (
        <>
          <section data-testid="opencode-catalog-mcp">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">MCP servers</h2>
              <span className="text-xs text-[var(--color-text-muted)]">{connected} connected / {servers.length} total</span>
            </div>
            {servers.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No MCP servers reported.</p> : (
              <ul className="divide-y divide-[var(--color-border-default)] rounded border border-[var(--color-border-default)]">
                {servers.map(([name, status]) => (
                  <li key={name} className="min-w-0 p-2.5" data-testid="opencode-catalog-mcp-row">
                    <div className="flex min-w-0 items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm">{name}</strong><McpBadge status={status} /></div>
                    {"error" in status && <p className="mt-1 break-words text-xs text-[var(--color-text-danger)]">{status.error}</p>}
                  </li>
                ))}
              </ul>
            )}
            <Link className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-[var(--color-text-info)] lg:min-h-0" to={toolsPath} data-testid="opencode-catalog-tools-link">Manage connections and authentication in Tools</Link>
          </section>
          <section data-testid="opencode-catalog-skills">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Skills ({catalogue.skills.length})</h2>
            {catalogue.skills.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No skills installed.</p> : (
              <ul className="space-y-2">{catalogue.skills.map((skill, index) => <li key={`${index}-${skill.name}`} className="min-w-0 rounded border border-[var(--color-border-default)] p-2.5"><strong className="block break-words text-sm">{skill.name}</strong><p className="mt-1 break-words text-xs text-[var(--color-text-muted)]">{skill.description}</p>{skill.location && <code className="mt-1 block break-all text-[10px] text-[var(--color-text-muted)]">{skill.location}</code>}</li>)}</ul>
            )}
          </section>
          <section data-testid="opencode-catalog-commands">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Custom commands ({catalogue.commands.length})</h2>
            {catalogue.commands.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No custom commands installed.</p> : (
              <ul className="space-y-2">{catalogue.commands.map((command, index) => <li key={`${index}-${command.name}`} className="min-w-0 rounded border border-[var(--color-border-default)] p-2.5"><strong className="block break-words text-sm">/{command.name}</strong>{command.description && <p className="mt-1 break-words text-xs text-[var(--color-text-muted)]">{command.description}</p>}<div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-[var(--color-text-muted)]">{command.source && <span>source: {command.source}</span>}{command.agent && <span>agent: {command.agent}</span>}{command.model && <span>model: {command.model}</span>}{command.subtask !== undefined && <span>{command.subtask ? "subtask" : "primary"}</span>}</div></li>)}</ul>
            )}
          </section>
        </>
      )}
    </section>
  );
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

function InspectorContent({
  catalogue,
  catalogError,
  catalogLoading,
  commands,
  directory,
  links,
  todos,
  todosLoaded,
  todosError,
  tab,
  onTabChange,
  onCatalogRefresh,
  onJump,
}: {
  catalogue: CatalogResponse | null;
  catalogError: string | null;
  catalogLoading: boolean;
  commands: CommandEntry[];
  directory: string;
  links: string[];
  todos: Todo[];
  todosLoaded: boolean;
  todosError: string | null;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onCatalogRefresh: () => void;
  onJump: (id: string) => void;
}) {
  return (
    <>
      <nav className="thin-scrollbar sticky top-0 z-10 flex overflow-x-auto border-b border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-1" aria-label="Session detail panels">
        {(["todo", "runlog", "reviews", "catalog"] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={`min-h-11 min-w-[4.5rem] shrink-0 flex-1 rounded px-2 py-1.5 text-xs lg:min-h-0 ${
              tab === name
                ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold"
                : "text-[var(--color-text-muted)]"
            }`}
            onClick={() => onTabChange(name)}
            data-testid={`opencode-inspector-${name}`}
          >
            {TAB_LABELS[name]}
            {name === "todo" && todos.length ? ` ${todos.length}` : ""}
            {name === "runlog" && commands.length ? ` ${commands.length}` : ""}
            {name === "reviews" && links.length ? ` ${links.length}` : ""}
          </button>
        ))}
      </nav>

      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tab === "todo" && <TodoPanel todos={todos} loaded={todosLoaded} error={todosError} />}

        {tab === "runlog" && (
          <section data-testid="opencode-command-list">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                Shell and tool history
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

        {tab === "reviews" && (
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
                    <ReviewCard url={url} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tab === "catalog" && <CatalogPanel catalogue={catalogue} loading={catalogLoading} error={catalogError} directory={directory} onRefresh={onCatalogRefresh} />}
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

export function SessionInspector({ directory, events, todos, todosLoaded, todosError, mobileOpen = false, onMobileClose }: SessionInspectorProps) {
  const commands = useMemo(() => extractCommands(events), [events]);
  const links = useMemo(() => extractMrUrls(events), [events]);
  const [tab, setTab] = useState<InspectorTab>("todo");
  const [catalogue, setCatalogue] = useState<{ directory: string; value: CatalogResponse } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const catalogRequest = useRef<{ id: number; controller: AbortController } | null>(null);
  const catalogueRef = useRef(catalogue);
  const directoryRef = useRef(directory);
  catalogueRef.current = catalogue;
  directoryRef.current = directory;

  const loadCatalogue = useCallback((force = false) => {
    if (!directory || (!force && catalogueRef.current?.directory === directory)) return;
    const id = (catalogRequest.current?.id ?? 0) + 1;
    catalogRequest.current?.controller.abort();
    const controller = new AbortController();
    catalogRequest.current = { id, controller };
    setCatalogLoading(true);
    setCatalogError(null);
    if (catalogueRef.current?.directory !== directory) setCatalogue(null);
    void api.catalog(directory, controller.signal).then((value) => {
      if (catalogRequest.current?.id !== id || controller.signal.aborted || directoryRef.current !== directory) return;
      setCatalogue({ directory, value });
    }).catch((error: unknown) => {
      if (catalogRequest.current?.id !== id || controller.signal.aborted || directoryRef.current !== directory) return;
      setCatalogError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (catalogRequest.current?.id === id && !controller.signal.aborted) setCatalogLoading(false);
    });
  }, [directory]);

  useEffect(() => {
    if (tab === "catalog") loadCatalogue();
  }, [loadCatalogue, tab]);

  useEffect(() => () => catalogRequest.current?.controller.abort(), []);

  const content = (onJump: (id: string) => void) => (
    <InspectorContent
      catalogue={catalogue?.directory === directory ? catalogue.value : null}
      catalogError={catalogError}
      catalogLoading={catalogLoading}
      commands={commands}
      directory={directory}
      links={links}
      todos={todos}
      todosLoaded={todosLoaded}
      todosError={todosError}
      tab={tab}
      onTabChange={setTab}
      onCatalogRefresh={() => loadCatalogue(true)}
      onJump={onJump}
    />
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
