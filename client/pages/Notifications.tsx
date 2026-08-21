import { useEffect, useMemo, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Badge, type BadgeVariant } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import {
  api,
  type NotificationHistoryState,
  type NotificationPreferences,
  type NotificationRecord,
  type NotifyEvent,
} from "../lib/api.js";
import { formatClockTime, formatRelative } from "../lib/derive.js";
import { useNotificationCenter } from "../lib/useNotificationCenter.js";
import { notifyBrowser } from "../lib/useNotifyWatcher.js";

const EVENTS: NotifyEvent[] = ["idle", "error", "abort", "permission", "question", "parked"];

const KIND_VARIANT: Record<NotifyEvent, BadgeVariant> = {
  idle: "neutral",
  error: "danger",
  abort: "warning",
  permission: "info",
  question: "info",
  parked: "warning",
};

const STATES: Array<{ value: NotificationHistoryState; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
];

function projectName(directory?: string): string {
  return directory?.split("/").filter(Boolean).at(-1) ?? "unknown project";
}

/** Plain-language delivery summary. Never claims a browser actually rendered it. */
function deliverySummary(record: NotificationRecord): string {
  if (record.delivery.suppressed === "auto-permissions") return "suppressed by auto permissions";
  const parts = [
    record.delivery.ntfy === "sent"
      ? "ntfy sent"
      : record.delivery.ntfy === "failed"
        ? `ntfy failed: ${record.delivery.ntfyError ?? "unknown error"}`
        : "ntfy off",
    record.delivery.browser === "allowed" ? "browser allowed" : "browser off",
  ];
  return parts.join(" · ");
}

function resolutionSummary(record: NotificationRecord): string | null {
  if (!record.actionable) return null;
  if (record.resolvedAt === undefined) return record.parkedAt ? "awaiting reply · parked" : "awaiting reply";
  return `${record.resolvedBy ?? "resolved"}`;
}

function HistoryRow({ record, onDismiss }: { record: NotificationRecord; onDismiss: (id: string) => void }) {
  const timestamp = new Date(record.at).toISOString();
  const active = record.actionable && record.resolvedAt === undefined;
  const resolution = resolutionSummary(record);
  return (
    <li
      className="flex items-start gap-3 border-b border-[var(--color-border-default)] p-3 last:border-0"
      data-testid="opencode-notification-record"
      data-kind={record.kind}
      data-active={active ? "true" : "false"}
    >
      <time
        dateTime={timestamp}
        title={new Date(record.at).toLocaleString()}
        className="w-16 shrink-0 pt-0.5 text-[10px] tabular-nums text-[var(--color-text-muted)]"
      >
        {formatRelative(timestamp) || formatClockTime(timestamp)}
      </time>
      <Badge variant={KIND_VARIANT[record.kind]} className="mt-0.5 shrink-0">
        {record.kind}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {record.click ? (
            <a className="underline underline-offset-2" href={record.click} data-testid="opencode-notification-link">
              {record.title}
            </a>
          ) : (
            record.title
          )}
        </p>
        <p className="truncate text-xs text-[var(--color-text-muted)]">{record.body}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
          {projectName(record.directory)}
          {record.sessionID ? ` · ${record.sessionID}` : ""} · {deliverySummary(record)}
          {resolution ? ` · ${resolution}` : ""}
        </p>
      </div>
      {active && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Dismiss ${record.title}`}
          onClick={() => onDismiss(record.id)}
          data-testid="opencode-notification-dismiss"
        >
          Dismiss
        </Button>
      )}
    </li>
  );
}

export function NotificationsPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [historyState, setHistoryState] = useState<NotificationHistoryState>("all");
  const { activeCount, records, loading, error: historyError, dismiss, clearResolved } = useNotificationCenter();

  useEffect(() => {
    void api.notifications().then((result) => {
      setPreferences(result.preferences);
      setTokenConfigured(result.tokenConfigured);
    }).catch((e: Error) => setError(e.message));
  }, []);

  // Filtered client-side: the centre already holds the newest page, so a
  // round trip per filter click would only add latency.
  const visible = useMemo(() => {
    if (historyState === "all") return records;
    const wantActive = historyState === "active";
    return records.filter((record) => (record.actionable && record.resolvedAt === undefined) === wantActive);
  }, [records, historyState]);

  const save = async () => {
    if (!preferences) return;
    try {
      const result = await api.saveNotifications(preferences);
      setPreferences(result.preferences);
      window.dispatchEvent(new Event("opencode-notification-preferences"));
      setMessage("Saved");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const testBrowser = async () => {
    if (!preferences) return;
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    notifyBrowser(preferences, "idle", "OpenCode notification test");
    setMessage("Browser test triggered");
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6" data-testid="opencode-notifications">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          Notifications
          {activeCount > 0 && (
            <Badge variant="counter" data-testid="opencode-notifications-active-count">
              {activeCount}
            </Badge>
          )}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Choose events independently for browser and ntfy delivery.</p>
      </header>
      {error && <Alert variant="danger">{error}</Alert>}
      {preferences && (
        <>
          <section className="space-y-3 rounded-lg border border-[var(--color-border-default)] p-4">
            <h2 className="font-semibold">Delivery</h2>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preferences.ntfy.enabled} onChange={(e) => setPreferences({ ...preferences, ntfy: { ...preferences.ntfy, enabled: e.target.checked } })} data-testid="opencode-ntfy-enabled" />ntfy enabled</label>
            <label className="block text-sm"><span className="mb-1 block">Server (configured by NTFY_SERVER)</span><input value={preferences.ntfy.server} readOnly className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)] p-2 text-[var(--color-text-muted)]" data-testid="opencode-ntfy-server" /></label>
            <label className="block text-sm"><span className="mb-1 block">Topic</span><input value={preferences.ntfy.topic} onChange={(e) => setPreferences({ ...preferences, ntfy: { ...preferences.ntfy, topic: e.target.value } })} className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2" data-testid="opencode-ntfy-topic" /></label>
            <p className="text-xs text-[var(--color-text-muted)]">Token: {tokenConfigured ? "configured in the environment" : "not configured"}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preferences.browser.desktop} onChange={(e) => setPreferences({ ...preferences, browser: { ...preferences.browser, desktop: e.target.checked } })} data-testid="opencode-browser-desktop" />Desktop notifications</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preferences.browser.sound} onChange={(e) => setPreferences({ ...preferences, browser: { ...preferences.browser, sound: e.target.checked } })} data-testid="opencode-browser-sound" />Sound</label>
            <label className="block text-sm">Volume <input type="range" min="0" max="1" step="0.05" value={preferences.browser.volume} onChange={(e) => setPreferences({ ...preferences, browser: { ...preferences.browser, volume: Number(e.target.value) } })} className="w-full" data-testid="opencode-browser-volume" /></label>
            <label className="block text-sm"><span className="mb-1 block">Parked permission after seconds</span><input type="number" min="5" max="3600" value={preferences.parkedPermissionSeconds} onChange={(e) => setPreferences({ ...preferences, parkedPermissionSeconds: Number(e.target.value) })} className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2" data-testid="opencode-parked-seconds" /></label>
          </section>

          <section className="overflow-x-auto rounded-lg border border-[var(--color-border-default)]">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border-default)]"><th className="p-2 text-left">Event</th><th className="p-2">Browser</th><th className="p-2">ntfy</th></tr></thead>
              <tbody>{EVENTS.map((event) => (
                <tr key={event} className="border-b border-[var(--color-border-default)] last:border-0">
                  <td className="p-2 capitalize">{event}</td>
                  {(["browser", "ntfy"] as const).map((channel) => (
                    <td key={channel} className="p-2 text-center"><input type="checkbox" checked={preferences[channel].events[event]} onChange={(e) => setPreferences({ ...preferences, [channel]: { ...preferences[channel], events: { ...preferences[channel].events, [event]: e.target.checked } } })} data-testid={`opencode-notify-${channel}-${event}`} /></td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </section>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void save()} data-testid="opencode-notifications-save">Save</Button>
            <Button variant="secondary" onClick={() => void testBrowser()} data-testid="opencode-notifications-test-browser">Test browser</Button>
            <Button variant="secondary" disabled={!preferences.ntfy.enabled || !preferences.ntfy.topic} onClick={() => void api.testNtfy().then(() => setMessage("ntfy test sent")).catch((e: Error) => setError(e.message))} data-testid="opencode-notifications-test-ntfy">Test ntfy</Button>
            {message && <span className="text-sm text-[var(--color-text-muted)]">{message}</span>}
          </div>
        </>
      )}

      <section className="rounded-lg border border-[var(--color-border-default)]" data-testid="opencode-notification-history">
        <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] p-3">
          <h2 className="mr-auto font-semibold">History</h2>
          {STATES.map((state) => (
            <Button
              key={state.value}
              size="sm"
              variant={historyState === state.value ? "secondary" : "ghost"}
              aria-pressed={historyState === state.value}
              onClick={() => setHistoryState(state.value)}
              data-testid={`opencode-history-filter-${state.value}`}
            >
              {state.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void clearResolved().catch((e: Error) => setError(e.message))}
            data-testid="opencode-history-clear"
          >
            Clear resolved
          </Button>
        </header>
        {historyError && <Alert variant="danger">{historyError}</Alert>}
        {visible.length === 0 ? (
          <p className="p-3 text-sm text-[var(--color-text-muted)]" data-testid="opencode-history-empty">
            {loading ? "Loading history..." : "No notifications recorded yet."}
          </p>
        ) : (
          <ul>
            {visible.map((record) => (
              <HistoryRow
                key={record.id}
                record={record}
                onDismiss={(id) => void dismiss(id).catch((e: Error) => setError(e.message))}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
