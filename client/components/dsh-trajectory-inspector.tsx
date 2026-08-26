import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Search, ShieldAlert, X } from "lucide-react";

import { api, type DshTrajectoryDetail, type DshTrajectoryEvent, type DshTrajectoryPage } from "../lib/api.js";
import { DSH_TRAJECTORY_FILTERS, deriveDshTrajectoryTiming, filterDshTrajectory, groupDshTrajectory, mergeDshTrajectoryEvents, trajectoryCategoryLabel, type DshTrajectoryFilter, type DshTrajectoryTiming } from "../lib/dshTrajectory.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";

interface Capabilities { sensitiveDetailEnabled: boolean; fullExportEnabled: boolean }

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Detail({ sessionId, event, onCollapse }: { sessionId: string; event: DshTrajectoryEvent; onCollapse: () => void }) {
  const [detail, setDetail] = useState<DshTrajectoryDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api.dshTrajectoryDetail(sessionId, event.id, controller.signal).then((result) => {
      setDetail(result.detail);
    }).catch((cause: Error) => {
      if (cause.name !== "AbortError") setError(cause.message);
    });
    return () => {
      controller.abort();
    };
  }, [event.id, sessionId]);
  return (
    <div className="mt-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-base)] p-2" data-testid="dsh-trajectory-detail">
      <div className="mb-2 flex items-start gap-2 text-xs text-[var(--color-text-warning)]"><ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0" size={14} /><span>{detail?.warning ?? "Loading this event's sensitive captured detail..."}</span></div>
      {error && <p className="text-xs text-[var(--color-text-danger)]" role="alert">{error}</p>}
      {detail && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">{JSON.stringify(detail.detail, null, 2)}</pre>}
      <Button className="mt-2" size="sm" variant="ghost" onClick={onCollapse} data-testid="dsh-trajectory-detail-collapse">Hide detail</Button>
    </div>
  );
}

function Metadata({ event, timing }: { event: DshTrajectoryEvent; timing?: DshTrajectoryTiming }) {
  const metadata = event.metadata;
  const usage = metadata?.usage;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--color-text-muted)]">
      <span>DCA #{event.observationSeq}</span>
      {event.nativeSeq !== undefined && <span>DSH #{event.nativeSeq}</span>}
      {event.nativeSessionId && <span>Stream {event.nativeSessionId}</span>}
      {metadata?.step !== undefined && <span>Step {metadata.step}</span>}
      {metadata?.callId && <span>Call {metadata.callId}</span>}
      {metadata?.compactionId && <span>Compaction {metadata.compactionId}</span>}
      {metadata?.childSessionId && <span>Child {metadata.childSessionId}</span>}
      {!!event.sourceEventSeqs?.length && <span>Sources {event.sourceEventSeqs.join(", ")}</span>}
      {event.sourceEventSeqsTruncated && <span>Source lineage truncated</span>}
      {event.surfaceOp === "append" && <span>Surface append</span>}
      {event.surfaceOp && event.surfaceOp !== "append" && <span>Surface replace {event.surfaceOp.start}-{event.surfaceOp.end}</span>}
      {timing?.durationMs !== undefined && <span>Duration {timing.durationMs} ms</span>}
      {timing?.firstTokenMs !== undefined && <span>First token {timing.firstTokenMs} ms</span>}
      {usage && <span>Tokens in {usage.inputTokens} / out {usage.outputTokens}{usage.reasoningTokens === undefined ? "" : ` / reasoning ${usage.reasoningTokens}`}</span>}
    </div>
  );
}

export function DshTrajectoryInspector({ sessionId, open, running, onClose }: { sessionId: string; open: boolean; running: boolean; onClose: () => void }) {
  const [page, setPage] = useState<DshTrajectoryPage | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>({ sensitiveDetailEnabled: false, fullExportEnabled: false });
  const [filter, setFilter] = useState<DshTrajectoryFilter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [detailEvent, setDetailEvent] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const exportAbort = useRef<AbortController | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    setDetailEvent(null);
    setPage(null);
    setError("");
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = () => void Promise.all([api.dshTrajectory(sessionId, { limit: 500 }), api.dshConfig()]).then(([result, config]) => {
      if (!active) return;
      setPage((current) => current ? { ...result, events: mergeDshTrajectoryEvents(current.events, result.events), nextBefore: current.nextBefore } : result);
      setCapabilities(config.trajectory);
      setError("");
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    load();
    const timer = running || page?.capturePending !== false ? setInterval(load, 1_000) : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [open, page?.capturePending, running, sessionId]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !asideRef.current) return;
      const focusable = [...asideRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onVisibility = () => {
      if (!document.hidden) return;
      setDetailEvent(null);
      exportAbort.current?.abort();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      exportAbort.current?.abort();
      setDetailEvent(null);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, sessionId]);

  const visible = useMemo(() => filterDshTrajectory(page?.events ?? [], filter, query), [filter, page?.events, query]);
  const groups = useMemo(() => groupDshTrajectory(visible), [visible]);
  const timing = useMemo(() => deriveDshTrajectoryTiming(page?.events ?? []), [page?.events]);
  if (!open) return null;

  const loadEarlier = async () => {
    if (!page?.nextBefore) return;
    try {
      const older = await api.dshTrajectory(sessionId, { limit: 500, before: page.nextBefore });
      setPage({ ...older, events: mergeDshTrajectoryEvents(older.events, page.events) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const reveal = (event: DshTrajectoryEvent) => {
    if (detailEvent === event.id) { setDetailEvent(null); return; }
    if (!window.confirm("Reveal sensitive captured detail for this one event? It may include prompts, commands, paths, tool input/output, reasoning, context, or model text.")) return;
    setDetailEvent(event.id);
  };
  const fullExport = async () => {
    if (!window.confirm("Download the full sensitive DCA-captured projection? Credential-shaped values were redacted before persistence, but other private content may remain.")) return;
    exportAbort.current?.abort();
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting(true);
    try {
      downloadBlob(await api.dshTrajectoryFullExport(sessionId, controller.signal), `dsh-trajectory-${sessionId}-sensitive.json`);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (exportAbort.current === controller) exportAbort.current = null;
      setExporting(false);
    }
  };

  return (
    <>
      <button type="button" aria-label="Close trajectory" className="fixed inset-0 top-11 z-[60] bg-black/40 lg:hidden" onClick={() => onCloseRef.current()} data-testid="dsh-trajectory-scrim" />
      <aside ref={asideRef} className="fixed inset-x-0 bottom-0 top-11 z-[61] flex min-h-0 flex-col overscroll-contain bg-[var(--color-background-surface)] shadow-2xl lg:left-auto lg:w-[46rem] lg:border-l lg:border-[var(--color-border-default)]" role="dialog" aria-modal="true" aria-labelledby="dsh-trajectory-title" data-testid="dsh-trajectory-inspector">
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] p-3">
          <div className="min-w-0 flex-1"><h2 id="dsh-trajectory-title" className="font-semibold">DSH Trajectory</h2><p className="truncate text-xs text-[var(--color-text-muted)]">DCA-captured projection; safe summaries by default</p></div>
          <Badge variant="neutral">{page?.events.length ?? 0}</Badge>
          <Button ref={closeRef} size="sm" variant="ghost" onClick={() => onCloseRef.current()} data-testid="dsh-trajectory-close"><X aria-hidden="true" size={15} /> Close</Button>
        </header>
        <div className="sticky top-0 z-10 shrink-0 space-y-2 border-b border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-3">
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border-default)] px-3"><Search aria-hidden="true" size={15} /><span className="sr-only">Search safe trajectory metadata</span><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search safe metadata" data-testid="dsh-trajectory-search" /></label>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter trajectory">
            {DSH_TRAJECTORY_FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs lg:min-h-8 ${filter === item.id ? "border-[var(--color-border-focus)] bg-[var(--color-background-surface-neutral-muted)] font-semibold" : "border-[var(--color-border-default)] text-[var(--color-text-muted)]"}`} data-testid={`dsh-trajectory-filter-${item.id}`}>{item.label}</button>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]"><span data-testid="dsh-trajectory-result-count">{visible.length} events</span><div className="flex gap-1"><a className="inline-flex min-h-10 items-center rounded px-2 font-semibold text-[var(--color-text-info)]" href={api.dshTrajectoryExportUrl(sessionId)} download data-testid="dsh-trajectory-export-safe"><Download aria-hidden="true" className="mr-1" size={14} /> Safe JSON</a>{capabilities.fullExportEnabled && <Button size="sm" variant="ghost" disabled={exporting} onClick={() => void fullExport()} data-testid="dsh-trajectory-export-full">{exporting ? "Exporting..." : "Sensitive JSON"}</Button>}</div></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && <p className="mb-3 text-sm text-[var(--color-text-danger)]" role="alert">Trajectory unavailable: {error}</p>}
          {page && <div className="mb-3 flex items-start gap-2 rounded-md border border-[var(--color-border-default)] p-2 text-xs text-[var(--color-text-muted)]"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={14} /><span>{page.coverage.note}{page.coverage.nativeStreams.reduce((total, stream) => total + stream.gaps, 0) ? ` ${page.coverage.nativeStreams.reduce((total, stream) => total + stream.gaps, 0)} native sequence gap(s) are visible across ${page.coverage.nativeStreams.length} stream(s).` : ""}</span></div>}
          {page?.nextBefore && <Button className="mb-3 w-full" variant="secondary" onClick={() => void loadEarlier()} data-testid="dsh-trajectory-load-earlier">Load earlier captured events</Button>}
          {!error && page && visible.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No matching trajectory events.</p>}
          <div className="space-y-4">
            {groups.map((group) => <section key={group.id} data-testid="dsh-trajectory-turn"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{group.label}</h3><ol className="space-y-2 border-l border-[var(--color-border-default)] pl-3">{group.events.map((event) => <li key={event.id} className="rounded-md border border-[var(--color-border-default)] p-2.5" data-kind={event.category} data-call-id={event.metadata?.callId} data-entry-id={event.id} data-testid="dsh-trajectory-entry"><div className="flex flex-wrap items-center gap-2"><Badge variant={event.category === "error" ? "danger" : event.category === "compaction" ? "warning" : "neutral"}>{trajectoryCategoryLabel(event.category)}</Badge><code className="min-w-0 flex-1 break-all text-[10px] text-[var(--color-text-muted)]">{event.type}</code><time className="text-[10px] text-[var(--color-text-muted)]" dateTime={event.nativeTime ?? event.observedAt}>{new Date(event.nativeTime ?? event.observedAt).toLocaleTimeString()}</time></div><p className="mt-1 break-words text-sm font-medium">{event.title}</p>{event.summary && <p className="mt-1 break-words text-xs text-[var(--color-text-muted)]">{event.summary}</p>}<Metadata event={event} timing={timing.get(event.id)} /><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-muted)]"><span>{event.source === "dsh-native-notification" ? "Native DSH event" : "DCA lifecycle"}</span>{event.ignorable && <span>Ignorable</span>}{capabilities.sensitiveDetailEnabled && event.hasDetail && <Button size="sm" variant="ghost" onClick={() => reveal(event)} data-testid="dsh-trajectory-detail-toggle">{detailEvent === event.id ? "Hide detail" : "Reveal sensitive detail"}</Button>}</div>{detailEvent === event.id && <Detail sessionId={sessionId} event={event} onCollapse={() => setDetailEvent(null)} />}</li>)}</ol></section>)}
          </div>
        </div>
      </aside>
    </>
  );
}
