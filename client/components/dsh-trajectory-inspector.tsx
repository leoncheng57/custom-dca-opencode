import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Search, ShieldAlert, X } from "lucide-react";

import { api, type DshTrajectoryDetail, type DshTrajectoryEvent, type DshTrajectoryPage } from "../lib/api.js";
import { DSH_TRAJECTORY_FILTERS, deriveDshTrajectoryTiming, filterDshTrajectory, groupDshTrajectory, mergeDshTrajectoryEvents, type DshTrajectoryFilter, type DshTrajectoryTiming } from "../lib/dshTrajectory.js";
import { Button } from "../ds/button.js";
import styles from "./dsh-trajectory-inspector.module.css";

interface Capabilities { sensitiveDetailEnabled: boolean; fullExportEnabled: boolean }
type VisualKind = "request" | "user" | "context" | "assistant" | "tool" | "child" | "compaction" | "error" | "system";

function visualKind(event: DshTrajectoryEvent): VisualKind {
  if (event.category === "error") return "error";
  if (event.category === "request") return "request";
  if (event.category === "tool") return "tool";
  if (event.category === "child") return "child";
  if (event.category === "compaction") return "compaction";
  if (event.type.startsWith("assistant/")) return "assistant";
  if (event.type === "user/message") return event.title.startsWith("User") ? "user" : "context";
  return "system";
}

function roleLabel(event: DshTrajectoryEvent, kind: VisualKind): string {
  if (event.type === "tool/result") return "Result";
  if (event.type === "assistant/chunk") return "Assistant";
  if (event.type === "assistant/message") return "Assistant";
  if (event.type.startsWith("turn/")) return "Turn";
  if (event.type.startsWith("step/")) return "Step";
  if (event.type.startsWith("compaction/")) return event.type === "compaction/summary" ? "Summary" : "Compacted";
  if (event.title === "Compaction surface replacement") return "Replacement";
  return kind === "system" ? "System" : kind;
}

function formatDuration(value: number): string {
  return value < 1_000 ? `${value} ms` : `${(value / 1_000).toFixed(value < 10_000 ? 2 : 1)} s`;
}

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
    return () => controller.abort();
  }, [event.id, sessionId]);
  return (
    <div className="mt-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-2" data-testid="dsh-trajectory-detail">
      <div className="mb-2 flex items-start gap-2 text-xs text-[var(--color-text-warning)]"><ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0" size={14} /><span>{detail?.warning ?? "Loading this event's sensitive captured detail..."}</span></div>
      {error && <p className="text-xs text-[var(--color-text-danger)]" role="alert">{error}</p>}
      {detail && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">{JSON.stringify(detail.detail, null, 2)}</pre>}
      <Button className="mt-2" size="sm" variant="ghost" onClick={onCollapse} data-testid="dsh-trajectory-detail-collapse">Hide detail</Button>
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={styles.detailBlock}><p className={styles.detailLabel}>{label}</p><div className={styles.detailValue}>{children}</div></div>;
}

function ExpandedMetadata({ event, timing }: { event: DshTrajectoryEvent; timing?: DshTrajectoryTiming }) {
  const metadata = event.metadata;
  const usage = metadata?.usage;
  return (
    <div className={styles.detailGrid}>
      <DetailBlock label="Identity">
        <div>DCA observation #{event.observationSeq}</div>
        {event.nativeSeq !== undefined && <div>DSH event #{event.nativeSeq}</div>}
        {event.nativeSessionId && <div>Stream {event.nativeSessionId}</div>}
      </DetailBlock>
      <DetailBlock label="Position">
        {metadata?.turn !== undefined && <div>Turn {metadata.turn}</div>}
        {metadata?.step !== undefined && <div>Step {metadata.step}</div>}
        {metadata?.callId && <div>Call {metadata.callId}</div>}
        {metadata?.compactionId && <div>Compaction {metadata.compactionId}</div>}
        {metadata?.childSessionId && <div>Child {metadata.childSessionId}</div>}
        {metadata?.turn === undefined && metadata?.step === undefined && !metadata?.callId && !metadata?.compactionId && !metadata?.childSessionId && <div>Session lifecycle</div>}
      </DetailBlock>
      <DetailBlock label="Timing">
        <div>{new Date(event.nativeTime ?? event.observedAt).toLocaleTimeString()}</div>
        {timing?.durationMs !== undefined && <div>Duration {formatDuration(timing.durationMs)}</div>}
        {timing?.firstTokenMs !== undefined && <div>First token {formatDuration(timing.firstTokenMs)}</div>}
      </DetailBlock>
      <DetailBlock label="Usage and lineage">
        {usage && <div>{usage.inputTokens} input · {usage.outputTokens} output{usage.reasoningTokens === undefined ? "" : ` · ${usage.reasoningTokens} reasoning`}</div>}
        {event.surfaceOp === "append" && <div>Surface append</div>}
        {event.surfaceOp && event.surfaceOp !== "append" && <div>Surface replace {event.surfaceOp.start}-{event.surfaceOp.end}</div>}
        {event.sourceEventSeqs !== undefined && <div>Sources {event.sourceEventSeqs.length ? event.sourceEventSeqs.join(", ") : "known empty"}{event.sourceEventSeqsTruncated ? " (truncated)" : ""}</div>}
        {!usage && !event.surfaceOp && event.sourceEventSeqs === undefined && <div>No usage or surface lineage</div>}
      </DetailBlock>
    </div>
  );
}

function CompactMetrics({ event, timing }: { event: DshTrajectoryEvent; timing?: DshTrajectoryTiming }) {
  const usage = event.metadata?.usage;
  const surface = event.surfaceOp && event.surfaceOp !== "append" ? `Surface replace ${event.surfaceOp.start}-${event.surfaceOp.end}` : undefined;
  return (
    <span className={styles.compactMeta}>
      <time className={styles.time} dateTime={event.nativeTime ?? event.observedAt}>{new Date(event.nativeTime ?? event.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
      {timing?.durationMs !== undefined && <span>{formatDuration(timing.durationMs)}</span>}
      {usage && <span>{usage.inputTokens} in · {usage.outputTokens} out</span>}
      {surface && <span>{surface}</span>}
    </span>
  );
}

function EventRow({ event, timing, selected, capabilities, detailEvent, onSelect, onReveal, onHideDetail }: {
  event: DshTrajectoryEvent;
  timing?: DshTrajectoryTiming;
  selected: boolean;
  capabilities: Capabilities;
  detailEvent: string | null;
  onSelect: () => void;
  onReveal: () => void;
  onHideDetail: () => void;
}) {
  const kind = visualKind(event);
  return (
    <li className={styles.row} data-visual-kind={kind} data-event-type={event.type} data-selected={selected} data-kind={event.category} data-call-id={event.metadata?.callId} data-entry-id={event.id} data-testid="dsh-trajectory-entry">
      <div className={styles.rail} aria-hidden="true"><span className={styles.marker} /></div>
      <div className={styles.body}>
        <button type="button" className={styles.rowButton} aria-expanded={selected} onClick={onSelect} data-testid="dsh-trajectory-row-toggle">
          <span className={styles.primary}>
            <span className={styles.headingLine}><span className={styles.tag} data-testid="dsh-trajectory-role-tag">{roleLabel(event, kind)}</span><span className={styles.title}>{event.title}</span></span>
            {event.summary && <span className={styles.summary}>{event.summary}</span>}
          </span>
          <CompactMetrics event={event} timing={timing} />
        </button>
        {selected && <div className={styles.expanded} data-testid="dsh-trajectory-row-detail">
          <div className={styles.eventType}>{event.type}</div>
          <ExpandedMetadata event={event} timing={timing} />
          <div className={styles.actions}>
            <span>{event.source === "dsh-native-notification" ? "Native DSH event" : "DCA lifecycle"}{event.ignorable ? " · ignorable" : ""}</span>
            {capabilities.sensitiveDetailEnabled && event.hasDetail && <Button className="ml-auto" size="sm" variant="ghost" onClick={onReveal} data-testid="dsh-trajectory-detail-toggle">{detailEvent === event.id ? "Hide sensitive detail" : "Reveal sensitive detail"}</Button>}
          </div>
          {detailEvent === event.id && <Detail sessionId={event.sessionId} event={event} onCollapse={onHideDetail} />}
        </div>}
      </div>
    </li>
  );
}

export function DshTrajectoryInspector({ sessionId, open, running, onClose }: { sessionId: string; open: boolean; running: boolean; onClose: () => void }) {
  const [page, setPage] = useState<DshTrajectoryPage | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>({ sensitiveDetailEnabled: false, fullExportEnabled: false });
  const [filter, setFilter] = useState<DshTrajectoryFilter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const exportAbort = useRef<AbortController | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    setDetailEvent(null);
    setSelectedEvent(null);
    setPage(null);
    setError("");
  }, [open, sessionId]);

  useEffect(() => setDetailEvent(null), [filter, query]);

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
  const gapCount = page?.coverage.nativeStreams.reduce((total, stream) => total + stream.gaps, 0) ?? 0;

  return (
    <>
      <button type="button" aria-label="Close trajectory" className="fixed inset-0 top-11 z-[60] bg-black/40 lg:hidden" onClick={() => onCloseRef.current()} data-testid="dsh-trajectory-scrim" />
      <aside ref={asideRef} className={`${styles.inspector} fixed inset-x-0 bottom-0 top-11 z-[61] flex min-h-0 flex-col overscroll-contain shadow-2xl lg:left-auto lg:w-[46rem] lg:border-l lg:border-[var(--color-border-default)]`} role="dialog" aria-modal="true" aria-labelledby="dsh-trajectory-title" data-testid="dsh-trajectory-inspector">
        <header className={`${styles.header} flex shrink-0 items-center gap-3 border-b border-[var(--color-border-default)] px-3 py-2`}>
          <div className="min-w-0 flex-1"><p className={styles.eyebrow}>DSH TRAJECTORY</p><h2 id="dsh-trajectory-title" className="mt-1 truncate text-sm font-semibold">Captured event ledger</h2></div>
          <span className={styles.count}>{page?.events.length ?? 0} events</span>
          <Button ref={closeRef} size="sm" variant="ghost" onClick={() => onCloseRef.current()} data-testid="dsh-trajectory-close"><X aria-hidden="true" size={15} /> Close</Button>
        </header>
        <div className={`${styles.toolbar} shrink-0 space-y-2 border-b border-[var(--color-border-default)] p-3`}>
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-3"><Search aria-hidden="true" size={15} /><span className="sr-only">Search safe trajectory metadata</span><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search safe metadata" data-testid="dsh-trajectory-search" /></label>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter trajectory">
            {DSH_TRAJECTORY_FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`${styles.filter} min-h-11 shrink-0 border px-3 lg:min-h-8 ${filter === item.id ? "border-[var(--color-text-info)] bg-[var(--color-background-surface-info-muted)] text-[var(--color-text-info)]" : "border-[var(--color-border-default)] bg-[var(--color-background-surface)] text-[var(--color-text-muted)]"}`} data-testid={`dsh-trajectory-filter-${item.id}`}>{item.label}</button>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]"><span data-testid="dsh-trajectory-result-count">{visible.length} shown</span><div className="flex gap-1"><a className="inline-flex min-h-10 items-center rounded px-2 font-semibold text-[var(--color-text-info)]" href={api.dshTrajectoryExportUrl(sessionId)} download data-testid="dsh-trajectory-export-safe"><Download aria-hidden="true" className="mr-1" size={14} /> Safe JSON</a>{capabilities.fullExportEnabled && <Button size="sm" variant="ghost" disabled={exporting} onClick={() => void fullExport()} data-testid="dsh-trajectory-export-full">{exporting ? "Exporting..." : "Sensitive JSON"}</Button>}</div></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && <p className="m-3 text-sm text-[var(--color-text-danger)]" role="alert">Trajectory unavailable: {error}</p>}
          {page && <div className={`${styles.coverage} flex items-start gap-2 px-3 py-2 text-[11px] text-[var(--color-text-muted)]`}><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={13} /><span>DCA-captured · incomplete · may contain gaps{gapCount ? ` · ${gapCount} known gap${gapCount === 1 ? "" : "s"}` : ""}</span></div>}
          {page?.nextBefore && <div className="p-3"><Button className="w-full" variant="secondary" onClick={() => void loadEarlier()} data-testid="dsh-trajectory-load-earlier">Load earlier captured events</Button></div>}
          {!error && page && visible.length === 0 && <p className="p-6 text-center text-sm text-[var(--color-text-muted)]">No matching trajectory events.</p>}
          <div className={styles.ledger}>
            {groups.map((group) => <section key={group.id} className={styles.group} data-testid="dsh-trajectory-turn"><header className={styles.groupHeader}><h3 className={styles.groupTitle}>{group.label}</h3><span className={styles.groupCount}>{group.events.length}</span></header><ol className={styles.rows}>{group.events.map((event) => <EventRow key={event.id} event={event} timing={timing.get(event.id)} selected={selectedEvent === event.id} capabilities={capabilities} detailEvent={detailEvent} onSelect={() => { setSelectedEvent((current) => current === event.id ? null : event.id); setDetailEvent(null); }} onReveal={() => reveal(event)} onHideDetail={() => setDetailEvent(null)} />)}</ol></section>)}
          </div>
        </div>
      </aside>
    </>
  );
}
