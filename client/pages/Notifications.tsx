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
import {
  initializeDeviceNotificationPreferences,
  loadDeviceNotificationPreferences,
  NOTIFICATION_MEDIA_CHANGE_EVENT,
  saveDeviceNotificationPreferences,
  SOUND_PROFILES,
  type DeviceNotificationPreferences,
} from "../lib/notificationMedia.js";
import {
  notificationCapabilities,
  previewNotificationSound,
  previewNotificationSpeech,
} from "../lib/notificationMediaBrowser.js";
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
    record.delivery.desktop === "allowed" ? "desktop allowed" : "desktop off",
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
  const [devicePreferences, setDevicePreferences] = useState<DeviceNotificationPreferences>(() => loadDeviceNotificationPreferences().preferences);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [historyState, setHistoryState] = useState<NotificationHistoryState>("all");
  const { activeCount, records, loading, error: historyError, dismiss } = useNotificationCenter();
  const capabilities = notificationCapabilities();

  useEffect(() => {
    void api.notifications().then((result) => {
      setPreferences(result.preferences);
      setDevicePreferences(initializeDeviceNotificationPreferences(result.preferences.browser).preferences);
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
      const savedDevicePreferences = saveDeviceNotificationPreferences(devicePreferences);
      setDevicePreferences(savedDevicePreferences);
      window.dispatchEvent(new Event("opencode-notification-preferences"));
      window.dispatchEvent(new CustomEvent(NOTIFICATION_MEDIA_CHANGE_EVENT, { detail: savedDevicePreferences }));
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
    notifyBrowser(preferences, "idle", "OpenCode notification test", undefined, devicePreferences);
    setMessage("Browser test triggered");
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" data-testid="opencode-notifications">
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
            <p className="text-xs text-[var(--color-text-muted)]" data-testid="opencode-notification-capability">
              Desktop notifications: {capabilities.desktop ? capabilities.desktopPermission : "unavailable in this browser"}.
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">On iPhone and iPad, browser notifications require installed-PWA and service-worker support. ntfy is the reliable phone notification path.</p>
            <label className="block text-sm"><span className="mb-1 block">Parked permission after seconds</span><input type="number" min="5" max="3600" value={preferences.parkedPermissionSeconds} onChange={(e) => setPreferences({ ...preferences, parkedPermissionSeconds: Number(e.target.value) })} className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2" data-testid="opencode-parked-seconds" /></label>
          </section>

          <section className="space-y-4 rounded-lg border border-[var(--color-border-default)] p-4" data-testid="opencode-notification-media">
            <div>
              <h2 className="font-semibold">Notification sound &amp; speech</h2>
              <p className="text-xs text-[var(--color-text-muted)]">These settings stay on this device. Spoken alerts use only generic status phrases.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-3 rounded-md bg-[var(--color-background-surface-neutral-muted)] p-3">
                <label className="flex items-center justify-between gap-3 text-sm font-medium">
                  Sound
                  <input type="checkbox" checked={devicePreferences.sound.enabled} disabled={!capabilities.audio} onChange={(e) => setDevicePreferences({ ...devicePreferences, sound: { ...devicePreferences.sound, enabled: e.target.checked } })} data-testid="opencode-browser-sound" />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 flex justify-between"><span>Volume</span><span>{Math.round(devicePreferences.sound.volume * 100)}%</span></span>
                  <input type="range" min="0" max="1" step="0.05" value={devicePreferences.sound.volume} disabled={!capabilities.audio} onChange={(e) => setDevicePreferences({ ...devicePreferences, sound: { ...devicePreferences.sound, volume: Number(e.target.value) } })} className="w-full" data-testid="opencode-browser-volume" />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block">Profile</span>
                  <select value={devicePreferences.sound.profile} disabled={!capabilities.audio} onChange={(e) => setDevicePreferences({ ...devicePreferences, sound: { ...devicePreferences.sound, profile: e.target.value as DeviceNotificationPreferences["sound"]["profile"] } })} className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-2 capitalize" data-testid="opencode-sound-profile">
                    {SOUND_PROFILES.map((profile) => <option key={profile} value={profile}>{profile}</option>)}
                  </select>
                </label>
                <Button size="sm" variant="secondary" disabled={!capabilities.audio} onClick={() => void previewNotificationSound(devicePreferences).then((played) => setMessage(played ? "Sound preview played" : "Sound preview unavailable")).catch(() => setMessage("Sound preview unavailable"))} data-testid="opencode-preview-sound">Preview sound</Button>
                <p className="text-xs text-[var(--color-text-muted)]">{capabilities.audio ? "Audio starts after you interact with this page." : "WebAudio is unavailable in this browser."}</p>
              </div>

              <div className="space-y-3 rounded-md bg-[var(--color-background-surface-neutral-muted)] p-3">
                <label className="flex items-center justify-between gap-3 text-sm font-medium">
                  Speak session status
                  <input type="checkbox" checked={devicePreferences.speech.enabled} disabled={!capabilities.speech} onChange={(e) => setDevicePreferences({ ...devicePreferences, speech: { ...devicePreferences.speech, enabled: e.target.checked } })} data-testid="opencode-speech-enabled" />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 flex justify-between"><span>Speech rate</span><span>{devicePreferences.speech.rate.toFixed(1)}x</span></span>
                  <input type="range" min="0.7" max="1.3" step="0.1" value={devicePreferences.speech.rate} disabled={!capabilities.speech} onChange={(e) => setDevicePreferences({ ...devicePreferences, speech: { ...devicePreferences.speech, rate: Number(e.target.value) } })} className="w-full" data-testid="opencode-speech-rate" />
                </label>
                <Button size="sm" variant="secondary" disabled={!capabilities.speech} onClick={() => setMessage(previewNotificationSpeech(devicePreferences) ? "Speech preview played" : "Speech preview unavailable")} data-testid="opencode-preview-speech">Preview speech</Button>
                <p className="text-xs text-[var(--color-text-muted)]">{capabilities.speech ? "New speech replaces any status still being spoken." : "Speech synthesis is unavailable in this browser."}</p>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Sound by event</legend>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {EVENTS.map((event) => (
                  <label key={event} className="flex min-w-0 items-center gap-2 text-sm capitalize">
                    <input type="checkbox" checked={devicePreferences.sound.events[event]} disabled={!capabilities.audio} onChange={(e) => setDevicePreferences({ ...devicePreferences, sound: { ...devicePreferences.sound, events: { ...devicePreferences.sound.events, [event]: e.target.checked } } })} data-testid={`opencode-sound-event-${event}`} />
                    <span className="truncate">{event}</span>
                  </label>
                ))}
              </div>
            </fieldset>
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
