import { useEffect, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import { api, type NotificationPreferences, type NotifyEvent } from "../lib/api.js";
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
import {
  NEVER_DELIVERED,
  NOTIFY_EVENT_CATALOGUE,
  NOTIFY_EVENT_GROUPS,
  notifyEventsInGroup,
  RECOMMENDED_NOTIFY_EVENTS,
} from "../lib/notificationEvents.js";
import { notifyBrowser } from "../lib/useNotifyWatcher.js";

const EVENTS: NotifyEvent[] = NOTIFY_EVENT_CATALOGUE.map((descriptor) => descriptor.event);

/**
 * Delivery preferences for notifications. Lives on the Settings page; the
 * notification *history* is a separate surface (the nav popover and
 * /settings/notifications) because reading a backlog and configuring delivery
 * are different jobs.
 */
export function NotificationPreferencesSection() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [devicePreferences, setDevicePreferences] = useState<DeviceNotificationPreferences>(() => loadDeviceNotificationPreferences().preferences);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const capabilities = notificationCapabilities();

  useEffect(() => {
    void api.notifications().then((result) => {
      setPreferences(result.preferences);
      setDevicePreferences(initializeDeviceNotificationPreferences(result.preferences.browser).preferences);
      setTokenConfigured(result.tokenConfigured);
    }).catch((e: Error) => setError(e.message));
  }, []);

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
    <section className="space-y-5" data-testid="opencode-notification-preferences">
      <header>
        <h2 className="text-lg font-bold">Notifications</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Pick which events reach you, separately for this browser and for ntfy on your phone.
        </p>
      </header>
      {error && <Alert variant="danger">{error}</Alert>}
      {preferences && (
        <>
          <section className="space-y-3 rounded-lg border border-[var(--color-border-default)] p-4">
            <h3 className="font-semibold">Delivery</h3>
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
              <h3 className="font-semibold">Notification sound &amp; speech</h3>
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
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {NOTIFY_EVENT_CATALOGUE.map(({ event, label }) => (
                  <label key={event} className="flex min-w-0 items-center gap-2 text-sm">
                    <input type="checkbox" checked={devicePreferences.sound.events[event]} disabled={!capabilities.audio} onChange={(e) => setDevicePreferences({ ...devicePreferences, sound: { ...devicePreferences.sound, events: { ...devicePreferences.sound.events, [event]: e.target.checked } } })} data-testid={`opencode-sound-event-${event}`} />
                    <span className="truncate">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section
            className="space-y-3 rounded-lg border border-[var(--color-border-default)] p-4"
            data-testid="opencode-notification-events"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">What gets sent</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Each channel is independent, so you can page your phone for approvals while the desktop stays quiet.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPreferences({
                  ...preferences,
                  browser: { ...preferences.browser, events: { ...RECOMMENDED_NOTIFY_EVENTS } },
                  ntfy: { ...preferences.ntfy, events: { ...RECOMMENDED_NOTIFY_EVENTS } },
                })}
                data-testid="opencode-notify-reset-recommended"
              >
                Only what needs me
              </Button>
            </div>

            {/* A ticked box that stays silent all day looks like a bug unless
                the two suppressed categories are named right here. */}
            <div
              className="rounded-md bg-[var(--color-background-surface-neutral-muted)] p-3 text-xs text-[var(--color-text-muted)]"
              data-testid="opencode-notify-never-delivered"
            >
              <p className="font-medium text-[var(--color-text-default)]">Never sent, whatever is ticked below</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {NEVER_DELIVERED.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <p className="mt-1">
                Both are still recorded, and the notification history can show them on request.
              </p>
            </div>

            {!preferences.ntfy.enabled && (
              <p className="text-xs text-[var(--color-text-muted)]" data-testid="opencode-notify-ntfy-inactive">
                ntfy is switched off above, so nothing in the ntfy column will fire yet.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                    <th className="p-2 text-left font-semibold">Event</th>
                    <th className="w-20 p-2 font-semibold">Browser</th>
                    <th className="w-20 p-2 font-semibold">ntfy</th>
                  </tr>
                </thead>
                {NOTIFY_EVENT_GROUPS.map((group) => (
                  <tbody key={group.id} data-testid={`opencode-notify-group-${group.id}`}>
                    <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)]">
                      <th className="p-2 text-left text-xs font-semibold" colSpan={3} scope="colgroup">
                        {group.title}
                        <span className="ml-2 font-normal text-[var(--color-text-muted)]">{group.summary}</span>
                      </th>
                    </tr>
                    {notifyEventsInGroup(group.id).map(({ event, label, description }) => (
                      <tr key={event} className="border-b border-[var(--color-border-default)] last:border-0">
                        <td className="p-2">
                          <span className="block font-medium">{label}</span>
                          <span className="block text-xs text-[var(--color-text-muted)]">{description}</span>
                        </td>
                        {(["browser", "ntfy"] as const).map((channel) => (
                          <td key={channel} className="p-2 text-center align-middle">
                            <input
                              type="checkbox"
                              // The visible label is the row's first cell, which a
                              // checkbox in another cell cannot claim implicitly.
                              aria-label={`${label} via ${channel === "ntfy" ? "ntfy" : "browser"}`}
                              checked={preferences[channel].events[event]}
                              onChange={(e) => setPreferences({ ...preferences, [channel]: { ...preferences[channel], events: { ...preferences[channel].events, [event]: e.target.checked } } })}
                              data-testid={`opencode-notify-${channel}-${event}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </section>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void save()} data-testid="opencode-notifications-save">Save</Button>
            <Button variant="secondary" onClick={() => void testBrowser()} data-testid="opencode-notifications-test-browser">Test browser</Button>
            <Button variant="secondary" disabled={!preferences.ntfy.enabled || !preferences.ntfy.topic} onClick={() => void api.testNtfy().then(() => setMessage("ntfy test sent")).catch((e: Error) => setError(e.message))} data-testid="opencode-notifications-test-ntfy">Test ntfy</Button>
            {message && <span className="text-sm text-[var(--color-text-muted)]">{message}</span>}
          </div>
        </>
      )}
    </section>
  );
}
