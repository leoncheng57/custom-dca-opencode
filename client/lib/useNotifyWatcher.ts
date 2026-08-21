import { useEffect } from "react";

import { api, type NotificationPreferences, type NotifyEvent } from "./api.js";
import {
  initializeDeviceNotificationPreferences,
  loadDeviceNotificationPreferences,
  NOTIFICATION_MEDIA_CHANGE_EVENT,
  type DeviceNotificationPreferences,
} from "./notificationMedia.js";
import { playNotificationSound, speakNotification, unlockNotificationAudio } from "./notificationMediaBrowser.js";

function classify(type: string, properties: Record<string, unknown>): NotifyEvent | null {
  if (type === "session.idle") return "idle";
  if (type === "permission.asked") return "permission";
  if (type === "question.asked") return "question";
  if (type === "notification.parked") return "parked";
  if (type === "session.error") {
    const error = properties.error;
    return error && typeof error === "object" && (error as Record<string, unknown>).name === "MessageAbortedError"
      ? "abort"
      : "error";
  }
  return null;
}

export function notifyBrowser(
  preferences: NotificationPreferences,
  event: NotifyEvent,
  title = `OpenCode: ${event}`,
  click?: string,
  devicePreferences = loadDeviceNotificationPreferences().preferences,
): void {
  if (!preferences.browser.events[event]) return;
  playNotificationSound(devicePreferences, event);
  speakNotification(devicePreferences, event);
  if (
    preferences.browser.desktop &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    const notification = new Notification(title, { body: "Open the IDE to review the session." });
    if (click) notification.onclick = () => window.location.assign(click);
  }
}

/** One app-level listener. SSE is a nudge; notification preferences stay server-backed. */
export function useNotifyWatcher(): void {
  useEffect(() => {
    let preferences: NotificationPreferences | null = null;
    let devicePreferences: DeviceNotificationPreferences = loadDeviceNotificationPreferences().preferences;
    const seen = new Map<string, number>();
    const refreshPreferences = () => void api.notifications().then((result) => {
      preferences = result.preferences;
      devicePreferences = initializeDeviceNotificationPreferences(result.preferences.browser).preferences;
    }).catch(() => undefined);
    refreshPreferences();
    const refreshDevicePreferences = (event: Event) => {
      devicePreferences = event instanceof CustomEvent && event.detail
        ? event.detail as DeviceNotificationPreferences
        : loadDeviceNotificationPreferences().preferences;
    };
    window.addEventListener("opencode-notification-preferences", refreshPreferences);
    window.addEventListener(NOTIFICATION_MEDIA_CHANGE_EVENT, refreshDevicePreferences);
    const unlockAudio = () => void unlockNotificationAudio().catch(() => undefined);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    const source = new EventSource(api.eventsUrl());
    source.onmessage = (message) => {
      let event: { type?: string; properties?: Record<string, unknown>; click?: string };
      try {
        event = JSON.parse(message.data) as typeof event;
      } catch {
        return;
      }
      if (!event.type || !preferences) return;
      const kind = classify(event.type, event.properties ?? {});
      if (!kind) return;
      const properties = event.properties ?? {};
      const key = `${event.type}:${String(properties.id ?? properties.requestID ?? properties.sessionID ?? message.lastEventId)}`;
      const now = Date.now();
      if (now - (seen.get(key) ?? 0) < 5_000) return;
      seen.set(key, now);
      if (seen.size > 500) {
        for (const [seenKey, timestamp] of seen) {
          if (now - timestamp > 60_000) seen.delete(seenKey);
        }
      }
      notifyBrowser(preferences, kind, undefined, event.click, devicePreferences);
    };
    return () => {
      source.close();
      window.removeEventListener("opencode-notification-preferences", refreshPreferences);
      window.removeEventListener(NOTIFICATION_MEDIA_CHANGE_EVENT, refreshDevicePreferences);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);
}
