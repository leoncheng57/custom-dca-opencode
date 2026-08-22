// client/pages/Terminal.tsx — the terminal surface.
//
// Renders strictly from GET /api/pty/capabilities. When PTY_ENABLED is unset
// the BFF does not mount the routes at all, so that call 404s and this page
// says the feature is off rather than offering controls that cannot work.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { Terminal, type TerminalHandle } from "../ds/terminal.js";
import { api, ApiError, type Pty, type PtyCapabilities, type PtyShell } from "../lib/api.js";
import {
  isPtyEvent,
  ptyInputAllowed,
  ptyInputBlockedReason,
  ptyLabel,
  ptyLocation,
  ptyStatusLabel,
} from "../lib/pty.js";

const DIRECTORY_KEY = "opencode.directory.v1";
/** Matches the `lg` breakpoint the inspector uses for the same phone/desktop split. */
const COMPACT_QUERY = "(max-width: 1023.98px)";
const RESIZE_DEBOUNCE_MS = 200;

function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const update = (): void => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}

export function TerminalPage() {
  const [params] = useSearchParams();
  const directory = params.get("directory") ?? localStorage.getItem(DIRECTORY_KEY) ?? "";
  const compact = useCompactViewport();

  const [capabilities, setCapabilities] = useState<PtyCapabilities | null>(null);
  const [featureOff, setFeatureOff] = useState(false);
  const [ptys, setPtys] = useState<Pty[]>([]);
  // The server's canonical form of `directory`. Paths in `Pty.cwd` are
  // canonical, so shortening them against the browser's alias would not match.
  const [canonicalDirectory, setCanonicalDirectory] = useState("");
  const [shells, setShells] = useState<PtyShell[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const terminalRef = useRef<TerminalHandle | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(
    () => ptys.find((pty) => pty.id === selectedId) ?? null,
    [ptys, selectedId],
  );
  const canType = ptyInputAllowed(capabilities, { compactViewport: compact, pty: selected });
  // Same rule as typing: a shell you cannot type into is not worth spawning,
  // and spawning one is the more consequential half of the pair.
  const canCreate = Boolean(capabilities?.canCreate) && !compact;
  const blockedReason = ptyInputBlockedReason(capabilities, { compactViewport: compact, pty: selected });

  useEffect(() => {
    let cancelled = false;
    api
      .ptyCapabilities()
      .then((value) => {
        if (!cancelled) setCapabilities(value);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // 404 is the documented "flag unset" signal: the router is not mounted.
        if (cause instanceof ApiError && cause.status === 404) setFeatureOff(true);
        else setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!directory || featureOff) return;
    api
      .ptys(directory)
      .then((value) => {
        setPtys(value.ptys);
        setCanonicalDirectory(value.directory);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [directory, featureOff]);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    if (!directory || !canCreate) return;
    let cancelled = false;
    api
      .ptyShells(directory)
      .then((value) => {
        if (!cancelled) setShells(value.shells);
      })
      // A missing shell list only costs the picker a default; never a banner.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [directory, canCreate]);

  // The PTY list stays live off the existing event fan-out. No poller: upstream
  // already emits pty.created / pty.updated / pty.exited / pty.deleted.
  useEffect(() => {
    if (!directory || featureOff) return;
    const source = new EventSource(api.eventsUrl(directory));
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { type?: string };
        if (isPtyEvent(event.type)) refresh();
      } catch {
        /* a malformed frame must never kill the stream */
      }
    };
    return () => source.close();
  }, [directory, featureOff, refresh]);

  // Attach. One socket at a time; changing the selection tears the old one down.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!directory || !selectedId || !terminal) return;
    terminal.clear();

    const socket = new WebSocket(api.ptyAttachUrl(directory, selectedId));
    socketRef.current = socket;
    socket.onmessage = (message) => {
      if (typeof message.data === "string") terminalRef.current?.write(message.data);
    };
    socket.onerror = () =>
      terminalRef.current?.notice("connection failed — the server refused this terminal");
    socket.onclose = (event) =>
      terminalRef.current?.notice(
        event.reason ? `disconnected: ${event.reason}` : "disconnected from this terminal",
      );

    return () => {
      socketRef.current = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }, [directory, selectedId]);

  const handleData = useCallback(
    (data: string) => {
      if (!canType) return;
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(data);
    },
    [canType],
  );

  // Resize goes over HTTP, not the socket: it is a mutation and passes the same
  // mode check as every other one. Debounced because a drag emits continuously.
  const handleResize = useCallback(
    (size: { rows: number; cols: number }) => {
      if (!directory || !selectedId || !capabilities?.canUpdate) return;
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => {
        api.resizePty(directory, selectedId, size).catch(() => undefined);
      }, RESIZE_DEBOUNCE_MS);
    },
    [directory, selectedId, capabilities?.canUpdate],
  );

  const create = (shell?: string): void => {
    if (!directory) return;
    setBusy(true);
    setError("");
    api
      .createPty(directory, shell ? { shell } : {})
      .then(({ pty }) => {
        setPtys((previous) => [pty, ...previous.filter((entry) => entry.id !== pty.id)]);
        setSelectedId(pty.id);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  const kill = (id: string): void => {
    if (!directory) return;
    setBusy(true);
    api
      .killPty(directory, id)
      .then(() => {
        if (selectedId === id) setSelectedId(null);
        refresh();
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  if (featureOff) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6" data-testid="opencode-terminal">
        <header>
          <h1 className="text-xl font-bold">Terminal</h1>
        </header>
        <Alert variant="info" data-testid="opencode-terminal-disabled">
          Terminals are disabled on this server. A PTY runs a login shell with the host environment
          and bypasses the permission rules in <code>opencode.json</code>, so it is off unless{" "}
          <code>PTY_ENABLED</code> is set to <code>read-only</code> or <code>interactive</code>.
        </Alert>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-6" data-testid="opencode-terminal">
      <header className="shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">Terminal</h1>
          {capabilities && (
            <Badge
              variant={capabilities.canInput ? "warning" : "neutral"}
              data-testid="opencode-terminal-mode"
            >
              {capabilities.canInput ? "interactive" : "read-only"}
            </Badge>
          )}
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Shells run on the host as your user and are not governed by agent permission rules.
          Starting, attaching and exiting are recorded in notification history.
        </p>
      </header>

      {!directory && (
        <Alert variant="warning" data-testid="opencode-terminal-no-directory">
          Open a project on the home page first.
        </Alert>
      )}
      {error && (
        <Alert variant="danger" data-testid="opencode-terminal-error">
          {error}
        </Alert>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside className="shrink-0 space-y-2 lg:w-72">
          {canCreate && directory && (
            <div className="flex flex-wrap gap-2" data-testid="opencode-terminal-launcher">
              <Button size="sm" disabled={busy} onClick={() => create()} data-testid="opencode-terminal-new">
                New terminal
              </Button>
              {!capabilities?.shellPinned &&
                shells.slice(0, 3).map((shell) => (
                  <Button
                    key={shell.path}
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => create(shell.path)}
                    data-testid="opencode-terminal-new-shell"
                  >
                    {shell.name}
                  </Button>
                ))}
            </div>
          )}
          <ul
            className="divide-y divide-[var(--color-border-default)] overflow-hidden rounded-[var(--border-radius-8)] border border-[var(--color-border-default)]"
            data-testid="opencode-terminal-list"
          >
            {ptys.length === 0 && (
              <li className="p-3 text-sm text-[var(--color-text-muted)]" data-testid="opencode-terminal-empty">
                No terminals in this project.
                {!canCreate && " Attach to work started elsewhere."}
              </li>
            )}
            {ptys.map((pty) => (
              <li
                key={pty.id}
                // min-w-0 on both the row and the label: without it the flex
                // child refuses to shrink, `truncate` never engages, and a long
                // cwd pushes the Kill button clean out of the sidebar.
                className="flex min-w-0 items-center gap-2 p-2"
                data-testid="opencode-terminal-row"
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(pty.id)}
                  className={`min-h-11 min-w-0 flex-1 rounded px-2 text-left text-sm ${
                    pty.id === selectedId
                      ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold"
                      : "hover:bg-[var(--hh-row-hover)]"
                  }`}
                  data-testid="opencode-terminal-select"
                >
                  <span className="block truncate">{ptyLabel(pty)}</span>
                  <span className="block truncate text-xs text-[var(--color-text-muted)]">
                    {ptyStatusLabel(pty)} · {ptyLocation(pty, canonicalDirectory || directory) || pty.cwd}
                  </span>
                </button>
                {capabilities?.canKill && pty.status === "running" && (
                  <Button
                    className="shrink-0"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => kill(pty.id)}
                    data-testid="opencode-terminal-kill"
                  >
                    Kill
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col gap-2">
          {blockedReason && selectedId && (
            <Alert variant="info" data-testid="opencode-terminal-readonly-notice">
              {blockedReason}
            </Alert>
          )}
          <div className="min-h-64 flex-1">
            {selectedId ? (
              <Terminal
                ref={terminalRef}
                readOnly={!canType}
                onData={handleData}
                onResize={handleResize}
                data-testid="opencode-terminal-view"
              />
            ) : (
              <div
                className="flex h-full min-h-64 items-center justify-center rounded-[var(--border-radius-8)] border border-dashed border-[var(--color-border-default)] p-6 text-sm text-[var(--color-text-muted)]"
                data-testid="opencode-terminal-placeholder"
              >
                Select a terminal to attach.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
