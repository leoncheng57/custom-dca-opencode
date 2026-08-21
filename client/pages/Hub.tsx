import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { LoadingIndicator } from "../ds/loading-indicator.js";
import { AgentModeToggle } from "../components/agent-mode-toggle.js";
import { api, formatCost, type HealthResponse, type SessionSummary, type Worktree } from "../lib/api.js";
import type { AgentMode } from "../lib/agentMode.js";

const DIRECTORY_KEY = "opencode.directory.v1";
const POLL_MS = 10_000;

export function StatusPill({ running }: { running: boolean }) {
  return (
    <span
      className={
        running
          ? "inline-flex shrink-0 items-center rounded-full bg-[var(--color-background-surface-info-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-info)]"
          : "inline-flex shrink-0 items-center rounded-full bg-[var(--color-background-surface-neutral-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]"
      }
      data-testid="opencode-status-pill"
    >
      {running ? "running" : "idle"}
    </span>
  );
}

export function HubPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Directory is the project selector for every API call, so it lives in the
  // URL (shareable, refresh-safe) and falls back to the last one used.
  const directory = params.get("directory") ?? localStorage.getItem(DIRECTORY_KEY) ?? "";
  const [directoryInput, setDirectoryInput] = useState(directory);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [mode, setMode] = useState<AgentMode>("build");
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);

  useEffect(() => {
    if (directory) localStorage.setItem(DIRECTORY_KEY, directory);
  }, [directory]);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  // In-flight guard: the interval keeps firing while a slow list call is
  // outstanding, and stacking requests against a wedged upstream helps nobody.
  const inFlight = useRef(false);
  const refresh = useCallback(() => {
    if (!directory || inFlight.current) return;
    inFlight.current = true;
    api
      .sessions(directory)
      .then((r) => {
        setSessions(r.sessions);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        inFlight.current = false;
      });
  }, [directory]);

  useEffect(() => {
    if (!directory) return;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [directory, refresh]);

  useEffect(() => {
    if (!directory) return;
    void api.worktrees(directory).then((result) => setWorktrees(result.worktrees)).catch(() => setWorktrees([]));
  }, [directory]);

  const applyDirectory = () => {
    const next = directoryInput.trim();
    if (!next) return;
    setSessions(null);
    setParams({ directory: next });
  };

  const create = async () => {
    if (!prompt.trim() || !directory) return;
    setCreating(true);
    setError(null);
    try {
      const { session } = await api.createSession({ directory, prompt, isolated, mode });
      navigate(`/sessions/${session.id}?directory=${encodeURIComponent(session.directory)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6" data-testid="opencode-hub">
      <header className="flex flex-wrap items-end gap-3 pt-2">
        <div>
          <h1 className="text-[1.6rem] font-bold tracking-tight">What should the agent do?</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            One OpenCode server, every project. Pick a directory to scope the session.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="beta">beta</Badge>
          {health && (
            <span
              className="text-xs text-[var(--color-text-muted)]"
              data-testid="opencode-upstream-badge"
              title={health.upstream.url}
            >
              {health.upstream.reachable
                ? `agent ${health.upstream.version ?? "?"}`
                : "agent unreachable"}
            </span>
          )}
        </div>
      </header>

      {health && !health.upstream.reachable && (
        <Alert variant="danger" data-testid="opencode-upstream-down">
          Cannot reach the OpenCode server at {health.upstream.url}. Start one with{" "}
          <code>opencode serve --port 4096</code>.
        </Alert>
      )}
      {health?.upstream.versionMatches === false && (
        <Alert variant="warning" data-testid="opencode-version-skew">
          Server is {health.upstream.version}, this client targets {health.upstream.expected}.
          Response shapes may differ.
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <section className="rounded-xl border border-[var(--color-border-default)] p-5">
        <h2 className="mb-3 text-sm font-semibold">New task</h2>
        <label className="mb-1 block text-xs text-[var(--color-text-muted)]" htmlFor="directory">
          Project directory (absolute path)
        </label>
        <div className="mb-3 flex gap-2">
          <input
            id="directory"
            value={directoryInput}
            onChange={(e) => setDirectoryInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyDirectory()}
            placeholder="/Users/you/Projects/my-repo"
            className="flex-1 rounded-md border border-[var(--color-border-default)] bg-transparent p-2 text-sm"
            data-testid="opencode-directory-input"
          />
          <Button variant="secondary" onClick={applyDirectory} data-testid="opencode-directory-apply">
            Use
          </Button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="What should the agent do?"
          className="mb-2 w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2 text-sm"
          data-testid="opencode-prompt"
        />
        <div className="flex flex-wrap items-center gap-2">
          <AgentModeToggle mode={mode} onChange={setMode} testId="opencode-hub-mode" />
          <Button
            onClick={() => void create()}
            disabled={creating || !prompt.trim() || !directory}
            data-testid="opencode-start"
          >
            {creating ? "Starting…" : "Start agent"}
          </Button>
          {!directory && (
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Set a project directory first.
            </span>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isolated} onChange={(event) => setIsolated(event.target.checked)} data-testid="opencode-isolated-workspace" />
          Isolated workspace (creates an OpenCode worktree before the agent starts)
        </label>
      </section>

      {directory && worktrees.length > 0 && (
        <section className="rounded-xl border border-[var(--color-border-default)]" data-testid="opencode-worktree-list">
          <div className="border-b border-[var(--color-border-default)] px-4 py-2 text-sm font-semibold">Isolated workspaces</div>
          <ul className="divide-y divide-[var(--color-border-default)]">
            {worktrees.map((worktree) => (
              <li key={worktree.directory} className="flex min-w-0 items-center gap-2 p-3 text-sm">
                <Link to={`/?directory=${encodeURIComponent(worktree.directory)}`} className="min-w-0 flex-1 truncate underline" data-testid="opencode-worktree-open">{worktree.name}</Link>
                <Button size="sm" variant="secondary" onClick={() => { if (window.confirm(`Hard-reset and clean ${worktree.name}?`)) void api.resetWorktree(directory, worktree.directory); }} data-testid="opencode-worktree-reset">Reset</Button>
                <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`Force-delete ${worktree.name} and its branch?`)) void api.deleteWorktree(directory, worktree.directory).then(() => setWorktrees((items) => items.filter((item) => item.directory !== worktree.directory))); }} data-testid="opencode-worktree-delete">Delete</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-[var(--color-border-default)]">
        <div className="border-b border-[var(--color-border-default)] px-4 py-2 text-sm font-semibold">
          Sessions
        </div>
        {!directory ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">
            Pick a project directory to list its sessions.
          </p>
        ) : sessions === null ? (
          <div className="p-6">
            <LoadingIndicator />
          </div>
        ) : sessions.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]" data-testid="opencode-sessions-empty">
            No sessions in this directory yet — start one above.
          </p>
        ) : (
          <ul data-testid="opencode-session-list">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="border-b border-[var(--color-border-default)] last:border-0"
                data-testid="opencode-session-row"
              >
                <Link
                  to={`/sessions/${session.id}?directory=${encodeURIComponent(directory)}`}
                  className="flex min-w-0 items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--hh-row-hover)]"
                >
                  <StatusPill running={session.running} />
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
                  {session.cost > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                      {formatCost(session.cost)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
