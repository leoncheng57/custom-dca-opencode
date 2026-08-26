import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Eye, FlaskConical, OctagonX, RefreshCw, Send, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { RunningIndicator, Transcript } from "../components/transcript.js";
import { api, type DshSessionSummary } from "../lib/api.js";
import { collapseActionGroups } from "../lib/derive.js";
import { PUBLIC_SIMULATOR } from "../lib/runtime.js";
import type { TranscriptEvent } from "../lib/transcript.js";

function PreviewDrawer({ onClose }: { onClose: () => void }) {
  const [port, setPort] = useState("5173");
  const [key, setKey] = useState(0);
  return (
    <section className="fixed inset-x-0 bottom-0 top-11 z-50 flex flex-col border-l border-[var(--color-border-default)] bg-[var(--color-background-surface)] shadow-xl sm:left-auto sm:w-[42rem]" data-testid="dsh-preview">
      <header className="flex items-center gap-2 border-b border-[var(--color-border-default)] p-2">
        <strong className="text-sm">Bounded local preview</strong>
        <Button className="ml-auto" size="sm" variant="ghost" onClick={onClose} data-testid="dsh-preview-close"><X aria-hidden="true" size={15} /> Close</Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">Port <input value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, ""))} className="w-24 rounded-md border border-[var(--color-border-default)] bg-transparent p-2" data-testid="dsh-preview-port" /></label>
          <Button variant="secondary" onClick={() => setKey((value) => value + 1)} data-testid="dsh-preview-reload"><RefreshCw aria-hidden="true" size={14} className="mr-1" /> Load / Reload</Button>
        </div>
        <iframe
          key={key}
          src={PUBLIC_SIMULATOR ? undefined : `/api/preview/${port}/`}
          srcDoc={PUBLIC_SIMULATOR ? "<!doctype html><html><body><main><h1>Simulated DSH preview</h1><p>This public fixture never contacts localhost, DSH, or a model provider.</p><button type='button'>Fixture action</button></main></body></html>" : undefined}
          title="Application preview"
          sandbox="allow-forms allow-modals allow-popups allow-scripts"
          className="min-h-0 flex-1 rounded border border-[var(--color-border-default)] bg-white"
          data-testid="dsh-preview-frame"
        />
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{PUBLIC_SIMULATOR ? "Fixture frame only. Public previews never contact localhost or a DSH runtime." : "Read-only GET/HEAD proxy. The DSH runtime cannot select or widen allowed ports."}</p>
      </div>
    </section>
  );
}

export function DshConversationPage() {
  const { id = "" } = useParams();
  const [session, setSession] = useState<DshSessionSummary | null>(null);
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef<string | null>(null);
  const sessionScope = useRef(id);

  const load = async (targetId: string) => {
    if (refreshInFlight.current) {
      refreshQueued.current = targetId;
      return;
    }
    refreshInFlight.current = true;
    try {
      const result = await api.dshSession(targetId);
      if (sessionScope.current !== targetId) return;
      setSession(result.session);
      setEvents(result.events);
      setSending(false);
      setError("");
    } catch (cause) {
      if (sessionScope.current !== targetId) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      refreshInFlight.current = false;
      const queued = refreshQueued.current;
      refreshQueued.current = null;
      if (queued) {
        void load(queued);
      }
    }
  };
  const refresh = () => load(id);

  useEffect(() => {
    sessionScope.current = id;
    refreshQueued.current = null;
    setSession(null);
    setEvents([]);
    void refresh();
    // The public simulator owns API state through a fetch shim. EventSource
    // bypasses that shim, so prompt/cancel refresh synchronously instead.
    if (PUBLIC_SIMULATOR) return;
    const source = new EventSource(api.dshEventsUrl(id));
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.addEventListener("update", () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250);
    });
    source.addEventListener("ready", () => void refresh());
    source.onerror = () => undefined; // EventSource owns bounded reconnect; fetch remains authoritative.
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [id]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [events, session?.running]);
  const items = useMemo(() => collapseActionGroups(events), [events]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || session?.running) return;
    setSending(true);
    setDraft("");
    setError("");
    try {
      await api.promptDsh(id, text);
      await refresh();
    } catch (cause) {
      setDraft(text);
      setSending(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };
  const cancel = async () => {
    try {
      await api.cancelDsh(id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--color-background-base)]" data-testid="dsh-conversation">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] px-3 py-2">
        <Link to="/dsh" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-default)]" data-testid="dsh-back">DSH lab</Link>
        <span aria-hidden="true">/</span>
        <strong className="min-w-0 truncate text-sm">{session?.title ?? "Conversation"}</strong>
        <Badge variant="neutral">Read only</Badge>
        <Badge variant="neutral">{session?.presetId ?? "Loading"}</Badge>
        <Button className="ml-auto" size="sm" variant="secondary" onClick={() => setPreview(true)} data-testid="dsh-open-preview"><Eye aria-hidden="true" className="mr-1" size={14} /> Preview</Button>
      </header>
      {error && <div className="shrink-0 p-3"><Alert variant="danger">{error}</Alert></div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" data-testid="dsh-transcript">
        <div className="mx-auto max-w-4xl">
          {events.length === 0 && !error && <div className="py-20 text-center"><FlaskConical aria-hidden="true" className="mx-auto mb-3 text-[var(--color-text-muted)]" /><p className="text-sm text-[var(--color-text-muted)]">Ask DSH to inspect this allowlisted workspace. V1 cannot modify files.</p></div>}
          <Transcript items={items} wrap collapsedGroups={{}} onToggleGroup={() => undefined} />
          {session?.running && <div className="mt-5"><RunningIndicator activity={{ kind: "thinking", since: session.updatedAt }} /></div>}
          <div ref={bottom} />
        </div>
      </div>
      <form className="shrink-0 border-t border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); void send(); }} data-testid="dsh-composer">
        <div className="mx-auto flex max-w-4xl items-end gap-2">
          <textarea className="min-h-11 max-h-40 flex-1 resize-y rounded-lg border border-[var(--color-border-default)] bg-[var(--color-background-base)] px-3 py-2 text-sm" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} placeholder="Ask DSH to inspect the workspace..." disabled={!session || session.running} data-testid="dsh-prompt" />
          {session?.running ? <Button type="button" variant="danger" onClick={() => void cancel()} data-testid="dsh-cancel"><OctagonX aria-hidden="true" size={15} className="mr-1" /> Stop</Button> : <Button type="submit" disabled={!draft.trim() || sending || !session} data-testid="dsh-send"><Send aria-hidden="true" size={15} className="mr-1" /> Send</Button>}
        </div>
      </form>
      {preview && <PreviewDrawer onClose={() => setPreview(false)} />}
    </main>
  );
}
