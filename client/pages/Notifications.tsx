import { useEffect, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import {
  api,
  type NotificationPreferences,
  type NotifyEvent,
} from "../lib/api.js";
import { notifyBrowser } from "../lib/useNotifyWatcher.js";

const EVENTS: NotifyEvent[] = ["idle", "error", "abort", "permission", "question", "parked"];

export function NotificationsPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void api.notifications().then((result) => {
      setPreferences(result.preferences);
      setTokenConfigured(result.tokenConfigured);
    }).catch((e: Error) => setError(e.message));
  }, []);

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
        <h1 className="text-xl font-bold">Notifications</h1>
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
    </main>
  );
}
