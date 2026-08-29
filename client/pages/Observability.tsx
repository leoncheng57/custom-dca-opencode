import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { LoadingIndicator } from "../ds/loading-indicator.js";
import { cn } from "../ds/utils.js";
import {
  api,
  type DeploymentSnapshot,
  type LogEntry,
  type LogSnapshot,
  type LogSource,
} from "../lib/api.js";

const TABS = [
  { id: "logs", label: "Logs" },
  { id: "deployment", label: "Deployment" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const SOURCES: Array<{ id: LogSource; label: string; hint: string }> = [
  { id: "audit", label: "Audit", hint: "Structured notification events" },
  { id: "stdout", label: "stdout", hint: "Supervised process output" },
  { id: "stderr", label: "stderr", hint: "Warnings and stack traces" },
];

const FOLLOW_INTERVAL_MS = 5_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClock(iso: string): string {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return iso;
  return new Date(value).toLocaleTimeString(undefined, { hour12: false });
}

function isTab(value: string | null): value is Tab {
  return value === "logs" || value === "deployment";
}

function isSource(value: string | null): value is LogSource {
  return value === "audit" || value === "stdout" || value === "stderr";
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.kind === "audit") {
    return (
      <li
        className="grid grid-cols-1 gap-1 border-b border-[var(--color-border-default)] px-2 py-1.5 last:border-b-0 sm:grid-cols-[5.5rem_13rem_1fr] sm:gap-2"
        data-testid="opencode-observability-row"
        data-kind="audit"
      >
        <span className="font-mono text-[0.68rem] tabular-nums text-[var(--color-text-muted)]">
          {formatClock(entry.ts)}
        </span>
        <span className="font-mono text-[0.7rem] font-semibold text-[var(--color-text-info)]">{entry.event}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.68rem]">
          {entry.fields.map((field) => (
            <span key={field.key} className="whitespace-nowrap">
              <span className="text-[var(--color-text-muted)]">{field.key}</span>{" "}
              <span className="text-[var(--color-text-success)]">{field.value}</span>
            </span>
          ))}
        </span>
      </li>
    );
  }

  const frames = entry.frames ?? [];
  const tone =
    entry.severity === "error"
      ? "text-[var(--color-text-danger)]"
      : entry.severity === "warn"
        ? "text-[var(--color-text-default)]"
        : "text-[var(--color-text-muted)]";

  return (
    <li
      className="border-b border-[var(--color-border-default)] px-2 py-1.5 last:border-b-0"
      data-testid="opencode-observability-row"
      data-kind="text"
    >
      <p className={cn("m-0 whitespace-pre-wrap break-words font-mono text-[0.68rem]", tone)}>
        {entry.prefix && (
          <span className="font-semibold text-[var(--color-text-warning)]">[{entry.prefix}] </span>
        )}
        {entry.text}
      </p>
      {frames.length > 0 && (
        <>
          {expanded && (
            <pre className="mt-1 overflow-x-auto border-l-2 border-[var(--color-border-default)] px-2 py-1 font-mono text-[0.64rem] leading-relaxed text-[var(--color-text-muted)]">
              {frames.join("\n")}
              {entry.framesTruncated ? "\n… further frames omitted" : ""}
            </pre>
          )}
          <Button
            className="mt-1 h-6 px-2 text-[0.64rem]"
            onClick={() => setExpanded((value) => !value)}
            size="sm"
            type="button"
            variant="ghost"
            data-testid="opencode-observability-frames-toggle"
          >
            {expanded ? "Hide" : `Show ${frames.length} frame${frames.length === 1 ? "" : "s"}`}
          </Button>
        </>
      )}
    </li>
  );
}

function LogsTab() {
  const [params, setParams] = useSearchParams();
  const sourceParam = params.get("source");
  const source: LogSource = isSource(sourceParam) ? sourceParam : "audit";

  const [snapshot, setSnapshot] = useState<LogSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    (refresh: boolean) =>
      api
        .observabilityLogs(source, refresh)
        .then((next) => {
          setSnapshot(next);
          setError("");
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false)),
    [source],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSnapshot(null);
    void api
      .observabilityLogs(source)
      .then((next) => {
        if (active) {
          setSnapshot(next);
          setError("");
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source]);

  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => void load(true), FOLLOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [following, load]);

  // Newest lines are at the bottom, so following is only useful if the view
  // keeps up with them.
  useEffect(() => {
    if (following && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [snapshot, following]);

  const setSource = (next: LogSource) => {
    const updated = new URLSearchParams(params);
    updated.set("source", next);
    setParams(updated, { replace: true });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex overflow-hidden rounded-md border border-[var(--color-border-default)]"
          role="group"
          aria-label="Log source"
        >
          {SOURCES.map((entry) => (
            <button
              key={entry.id}
              className={cn(
                "min-h-9 px-3 text-xs font-semibold",
                entry.id === source
                  ? "bg-[var(--color-background-surface-neutral-muted)] text-[var(--color-text-default)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-background-action-ghost-hover)]",
              )}
              onClick={() => setSource(entry.id)}
              title={entry.hint}
              type="button"
              aria-pressed={entry.id === source}
              data-testid={`opencode-observability-source-${entry.id}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <Button
          className="gap-1.5"
          onClick={() => setFollowing((value) => !value)}
          size="sm"
          type="button"
          variant={following ? "secondary" : "ghost"}
          aria-pressed={following}
          data-testid="opencode-observability-follow"
        >
          {following ? `Following · ${FOLLOW_INTERVAL_MS / 1000}s` : "Follow"}
        </Button>

        <Button
          className="gap-1.5"
          onClick={() => void load(true)}
          size="sm"
          type="button"
          variant="ghost"
          data-testid="opencode-observability-refresh"
        >
          <RefreshCw aria-hidden="true" size={14} />
          Refresh
        </Button>

        {snapshot?.exists && (
          <span className="ml-auto text-xs text-[var(--color-text-muted)]" data-testid="opencode-observability-meta">
            {snapshot.entries.length} rows · {formatBytes(snapshot.sizeBytes)}
          </span>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {snapshot?.truncated && (
        <Alert variant="warning">
          Showing the most recent lines only. This file has no rotation, so it keeps growing — the full history is on
          disk at <code className="font-mono text-[0.7rem]">{snapshot.file}</code>.
        </Alert>
      )}

      {loading && !snapshot ? (
        <div className="flex min-h-40 items-center justify-center" data-testid="opencode-observability-loading">
          <LoadingIndicator label="Loading logs" />
        </div>
      ) : snapshot && !snapshot.exists ? (
        <div
          className="rounded-lg border border-dashed border-[var(--color-border-default)] p-6 text-center text-sm text-[var(--color-text-muted)]"
          data-testid="opencode-observability-empty"
        >
          No file at <code className="font-mono text-xs">{snapshot.file}</code> yet. It is created on the first write.
        </div>
      ) : snapshot && snapshot.entries.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-[var(--color-border-default)] p-6 text-center text-sm text-[var(--color-text-muted)]"
          data-testid="opencode-observability-empty"
        >
          The file exists but has no readable lines yet.
        </div>
      ) : (
        <div
          className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--color-border-default)]"
          ref={scroller}
        >
          <ul className="m-0 list-none p-0" data-testid="opencode-observability-rows">
            {snapshot?.entries.map((entry) => <LogRow entry={entry} key={entry.id} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function AssetIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 aria-hidden="true" className="text-[var(--color-text-success)]" size={15} />
  ) : (
    <XCircle aria-hidden="true" className="text-[var(--color-text-danger)]" size={15} />
  );
}

function DeploymentTab() {
  const [snapshot, setSnapshot] = useState<DeploymentSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (refresh = false) => {
    setLoading(true);
    return api
      .observabilityDeployment(refresh)
      .then((next) => {
        setSnapshot(next);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    void api
      .observabilityDeployment()
      .then((next) => {
        if (active) setSnapshot(next);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading && !snapshot) {
    return (
      <div className="flex min-h-40 items-center justify-center" data-testid="opencode-observability-deployment-loading">
        <LoadingIndicator label="Loading deployment status" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="opencode-observability-deployment">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex items-center gap-2">
        <Button
          className="gap-1.5"
          onClick={() => void load(true)}
          size="sm"
          type="button"
          variant="ghost"
          data-testid="opencode-observability-deployment-refresh"
        >
          <RefreshCw aria-hidden="true" size={14} />
          Refresh
        </Button>
        {snapshot && (
          <span className="text-xs text-[var(--color-text-muted)]">Checked {formatClock(snapshot.readAt)}</span>
        )}
      </div>

      {snapshot && (
        <>
          <section>
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Served assets
            </h2>
            {snapshot.assetsVerdict !== "ok" && (
              <Alert variant={snapshot.assetsVerdict === "corrupted" ? "danger" : "info"}>{snapshot.assetsNote}</Alert>
            )}
            <ul className="m-0 mt-1.5 list-none rounded-lg border border-[var(--color-border-default)] p-0">
              {snapshot.assets.map((asset) => (
                <li
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] px-3 py-2 text-sm last:border-b-0"
                  key={asset.path}
                  data-testid="opencode-observability-asset"
                >
                  <AssetIcon ok={asset.ok} />
                  <code className="font-mono text-xs">{asset.path}</code>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {asset.status ?? "—"} · {asset.contentType ?? "no content-type"}
                    {asset.bytes !== null ? ` · ${formatBytes(asset.bytes)}` : ""}
                  </span>
                  {asset.problem && (
                    <span className="w-full text-xs text-[var(--color-text-danger)]">{asset.problem}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              Bundle at <code className="font-mono">{snapshot.bundle.directory}</code> ·{" "}
              {snapshot.bundle.hasServiceWorker ? "sw.js present" : "sw.js MISSING"} ·{" "}
              {snapshot.bundle.hasManifest ? "manifest present" : "manifest MISSING"}
              {snapshot.bundle.indexHtmlSha1
                ? ` · index.html ${snapshot.bundle.indexHtmlSha1.slice(0, 12)}`
                : " · index.html unreadable"}
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Processes
            </h2>
            {!snapshot.servicesAvailable && snapshot.servicesNote && (
              <Alert variant="info">{snapshot.servicesNote}</Alert>
            )}
            <ul className="m-0 mt-1.5 list-none rounded-lg border border-[var(--color-border-default)] p-0">
              {snapshot.services.map((service) => (
                <li
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] px-3 py-2 last:border-b-0"
                  key={service.label}
                  data-testid="opencode-observability-service"
                >
                  <code className="font-mono text-xs font-semibold">{service.label}</code>
                  {snapshot.servicesAvailable ? (
                    <Badge variant={service.loaded ? "success" : "neutral"}>
                      {service.loaded ? `pid ${service.pid ?? "—"}` : "not loaded"}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">unknown</Badge>
                  )}
                  <Badge variant={service.restartCost === "safe" ? "info" : "warning"}>
                    restart: {service.restartCost}
                  </Badge>
                  <span className="w-full text-xs text-[var(--color-text-muted)]">{service.restartNote}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Before restarting OpenCode
            </h2>
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-2"
              data-testid="opencode-observability-busy"
            >
              {snapshot.busySessions.count === null ? (
                <Badge variant="neutral">unknown</Badge>
              ) : snapshot.busySessions.count > 0 ? (
                <Badge variant="warning">
                  <AlertTriangle aria-hidden="true" size={12} /> {snapshot.busySessions.count} busy
                </Badge>
              ) : (
                <Badge variant="success">none seen busy</Badge>
              )}
              <span className="text-xs text-[var(--color-text-muted)]">{snapshot.busySessions.note}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Host-level observability: recent BFF log output, and what is running.
 *
 * Not project-scoped. Everything here describes this machine, which is why the
 * page takes no `?directory=` and none of its routes accept one.
 */
export function ObservabilityPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "logs";

  const setTab = (next: Tab) => {
    const updated = new URLSearchParams(params);
    updated.set("tab", next);
    setParams(updated, { replace: true });
  };

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6" data-testid="opencode-observability">
      <header>
        <h1 className="text-xl font-bold">Observability</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Recent log output and deployment state for this host. Read-only.
        </p>
      </header>

      <div className="flex gap-1 border-b border-[var(--color-border-default)]" role="tablist" aria-label="Observability views">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={cn(
              "-mb-px min-h-9 border-b-2 px-3 text-sm font-semibold",
              entry.id === tab
                ? "border-[var(--color-text-info)] text-[var(--color-text-default)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-default)]",
            )}
            onClick={() => setTab(entry.id)}
            role="tab"
            aria-selected={entry.id === tab}
            type="button"
            data-testid={`opencode-observability-tab-${entry.id}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "logs" ? <LogsTab /> : <DeploymentTab />}
    </main>
  );
}
