// Live session browser drawer (issue #229).
//
// A right-edge drawer keyed by sessionID, showing a server-side Chromium page
// as an MJPEG stream and forwarding input. It shares NOTHING with the
// localhost preview tab in WorkspacePanels: different target (the internet),
// different renderer (out-of-process Chromium), different lifecycle (the page
// survives closing this drawer; reopening reattaches).
//
// Popups are intercepted server-side and surfaced here as a prompt — the
// issue's "open here or in a new tab?" requirement — because a session owns
// exactly one page.

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import { PUBLIC_SIMULATOR } from "../lib/runtime.js";

const VIEWPORT = { width: 1280, height: 800 };

interface PageState {
  sessionID: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  pendingPopup: string | null;
}

interface CapacitySlot {
  sessionID: string;
  url: string;
  lastUsedAt: number;
}

async function browserApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/browser/${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; slots?: CapacitySlot[] };
    const error = new Error(body.error || `live browser request failed (${response.status})`) as Error & {
      slots?: CapacitySlot[];
    };
    if (body.slots) error.slots = body.slots;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function LiveBrowserDrawer({ sessionID, onClose }: { sessionID: string; onClose: () => void }) {
  const [state, setState] = useState<PageState | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [capacity, setCapacity] = useState<CapacitySlot[] | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const [popup, setPopup] = useState<string | null>(null);
  const frameRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const addressEdited = useRef(false);

  const refreshState = useCallback(async () => {
    try {
      const next = await browserApi<PageState>(`${sessionID}/state`);
      setState(next);
      if (next.pendingPopup) setPopup(next.pendingPopup);
      if (!addressEdited.current) setAddress(next.url === "about:blank" ? "" : next.url);
    } catch {
      // Stream errors surface through the open/navigate paths instead.
    }
  }, [sessionID]);

  // Open (or reattach to) this session's page, then poll state for the URL
  // bar, nav-button enablement and intercepted popups.
  useEffect(() => {
    if (PUBLIC_SIMULATOR) return;
    let cancelled = false;
    void browserApi<PageState>(`${sessionID}/open`, { method: "POST", body: JSON.stringify({}) })
      .then((next) => {
        if (cancelled) return;
        setState(next);
        if (!addressEdited.current) setAddress(next.url === "about:blank" ? "" : next.url);
        setStreamKey((key) => key + 1);
      })
      .catch((cause: Error & { slots?: CapacitySlot[] }) => {
        if (cancelled) return;
        setError(cause.message);
        if (cause.slots) setCapacity(cause.slots);
      });
    const timer = setInterval(() => void refreshState(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshState, sessionID]);

  // Escape closes; focus is restored to the opener, matching DesktopInspector.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  const navigate = async (body: { action: string; url?: string }) => {
    setError("");
    try {
      const next = await browserApi<PageState>(`${sessionID}/navigate`, { method: "POST", body: JSON.stringify(body) });
      setState(next);
      addressEdited.current = false;
      setAddress(next.url === "about:blank" ? "" : next.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const sendInput = (event: Record<string, unknown>) => {
    void browserApi(`${sessionID}/input`, { method: "POST", body: JSON.stringify(event) }).catch(() => undefined);
  };

  /** Map a pointer event on the scaled <img> back into viewport coordinates. */
  const frameCoordinates = (event: React.MouseEvent<HTMLImageElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * VIEWPORT.width,
      y: ((event.clientY - bounds.top) / bounds.height) * VIEWPORT.height,
    };
  };

  return (
    <div data-testid="opencode-live-browser-surface">
      <button
        type="button"
        className="fixed inset-0 z-50 bg-[var(--color-background-overlay)]"
        aria-label="Close live browser"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Live browser"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[calc(100vw-1rem)] flex-col overflow-hidden border-l border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl sm:w-[42rem]"
        data-testid="opencode-live-browser"
      >
        <header className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border-default)] p-2">
          <Button size="sm" variant="ghost" disabled={!state?.canGoBack} onClick={() => void navigate({ action: "back" })} aria-label="Back" title="Back" data-testid="opencode-live-browser-back">←</Button>
          <Button size="sm" variant="ghost" disabled={!state?.canGoForward} onClick={() => void navigate({ action: "forward" })} aria-label="Forward" title="Forward" data-testid="opencode-live-browser-forward">→</Button>
          <Button size="sm" variant="ghost" onClick={() => void navigate({ action: "reload" })} aria-label="Reload" title="Reload" data-testid="opencode-live-browser-reload">⟳</Button>
          <form
            className="flex min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (address.trim()) void navigate({ action: "goto", url: address.trim() });
            }}
          >
            <input
              value={address}
              onChange={(event) => {
                addressEdited.current = true;
                setAddress(event.target.value);
              }}
              placeholder={PUBLIC_SIMULATOR ? "Simulator: live browser is unavailable" : "Enter a URL"}
              disabled={PUBLIC_SIMULATOR}
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border-default)] bg-transparent px-2 py-1.5 text-xs"
              aria-label="Address"
              data-testid="opencode-live-browser-address"
            />
          </form>
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="opencode-live-browser-close">Close</Button>
        </header>

        {error && (
          <div className="p-3">
            <Alert variant="danger" data-testid="opencode-live-browser-error">{error}</Alert>
            {capacity && (
              <ul className="mt-2 grid gap-1 text-xs" data-testid="opencode-live-browser-slots">
                {capacity.map((slot) => (
                  <li key={slot.sessionID} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">{slot.sessionID} — {slot.url || "blank"}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void browserApi(`${slot.sessionID}`, { method: "DELETE" }).then(() => {
                          setCapacity(null);
                          setError("");
                          setStreamKey((key) => key + 1);
                          void browserApi<PageState>(`${sessionID}/open`, { method: "POST", body: JSON.stringify({}) }).then(setState).catch(() => undefined);
                        });
                      }}
                      data-testid="opencode-live-browser-release"
                    >
                      Release
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {popup && (
          <div className="border-b border-[var(--color-border-default)] bg-[var(--color-background-surface-info-muted)] p-3 text-xs" role="alertdialog" aria-label="Open link" data-testid="opencode-live-browser-popup">
            <p className="mb-2 break-all">The page tried to open <strong>{popup}</strong></p>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => { void navigate({ action: "goto", url: popup }); setPopup(null); }} data-testid="opencode-live-browser-popup-here">Open here</Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  window.open(popup, "_blank", "noopener,noreferrer");
                  setPopup(null);
                }}
                data-testid="opencode-live-browser-popup-newtab"
              >
                Open in a new tab
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPopup(null)} data-testid="opencode-live-browser-popup-dismiss">Dismiss</Button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-background-surface-neutral-muted)] p-2">
          {PUBLIC_SIMULATOR ? (
            <p className="p-4 text-xs text-[var(--color-text-muted)]" data-testid="opencode-live-browser-simulator">
              The live browser drives a server-side Chromium and is unavailable in the public simulator.
            </p>
          ) : (
            /* The stream is pixels, not a document: input is forwarded, so this
               is interactive despite being an <img>. */
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <img
              key={streamKey}
              ref={frameRef}
              src={`/api/browser/${encodeURIComponent(sessionID)}/stream?key=${streamKey}`}
              alt="Live browser page"
              width={VIEWPORT.width}
              height={VIEWPORT.height}
              tabIndex={0}
              className="h-auto w-full cursor-pointer select-none rounded border border-[var(--color-border-default)] bg-white outline-none focus:ring-1 focus:ring-[var(--color-border-focus,currentColor)]"
              draggable={false}
              onClick={(event) => sendInput({ type: "click", ...frameCoordinates(event) })}
              onContextMenu={(event) => {
                event.preventDefault();
                sendInput({ type: "click", button: "right", ...frameCoordinates(event) });
              }}
              onWheel={(event) => sendInput({ type: "scroll", deltaY: event.deltaY, ...frameCoordinates(event) })}
              onKeyDown={(event) => {
                if (event.key === "Escape") return;
                event.preventDefault();
                if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) sendInput({ type: "type", text: event.key });
                else sendInput({ type: "key", key: event.key });
              }}
              data-testid="opencode-live-browser-frame"
            />
          )}
        </div>

        <footer className="shrink-0 border-t border-[var(--color-border-default)] px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">
          {state?.loading ? "Loading…" : state?.title || "Server-side Chromium; the page persists after closing this drawer."}
        </footer>
      </section>
    </div>
  );
}
