import { useEffect, useRef } from "react";

import { api, type NotificationPreferences, type NotifyEvent } from "./api.js";
import { PUBLIC_SIMULATOR } from "./runtime.js";
import {
  initializeDeviceNotificationPreferences,
  loadDeviceNotificationPreferences,
  NOTIFICATION_MEDIA_CHANGE_EVENT,
  type DeviceNotificationPreferences,
} from "./notificationMedia.js";
import { playNotificationSound, speakNotification, unlockNotificationAudio } from "./notificationMediaBrowser.js";
import { ACTIVE_SET_EVENTS } from "./useNotificationCenter.js";

const NOTIFY_EVENT_KINDS = new Set<string>(["idle", "error", "abort", "permission", "question", "parked"]);

/**
 * What this browser should ring a bell for, taken from the server's own
 * `notification.recorded` verdict rather than re-derived from raw upstream
 * events.
 *
 * The previous version classified `session.idle`, `permission.asked` and
 * friends directly off the event stream. That gave it no knowledge of session
 * lineage, so every delegated child's turn produced a desktop popup, a sound
 * and speech in every open tab — while the server recorded the same event as
 * `suppressed: "subagent"` and hid it from the inbox and the badge. The user
 * was pinged for things their notification list swore had never happened.
 *
 * A record the server suppressed was, by definition, one nobody was meant to
 * be told about: auto-approved permissions, sub-agent chatter, and event kinds
 * switched off in every channel. Returning null for those is the whole fix.
 */
function recordedKind(properties: Record<string, unknown>): NotifyEvent | null {
  if (properties.suppressed) return null;
  const kind = properties.kind;
  return typeof kind === "string" && NOTIFY_EVENT_KINDS.has(kind) ? (kind as NotifyEvent) : null;
}

export function notifyBrowser(
  preferences: NotificationPreferences,
  event: NotifyEvent,
  title = `OpenCode: ${event}`,
  click?: string,
  devicePreferences = loadDeviceNotificationPreferences().preferences,
  /** Record id. Used as the OS notification tag so several open tabs showing
   *  the same record collapse into one popup instead of stacking. */
  tag?: string,
): void {
  if (!preferences.browser.events[event]) return;
  playNotificationSound(devicePreferences, event);
  speakNotification(devicePreferences, event);
  if (
    preferences.browser.desktop &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    const notification = new Notification(title ?? `OpenCode: ${event}`, {
      body: "Open the IDE to review the session.",
      // Without a tag the OS stacks one popup per open tab, so a single
      // notification looked like three on a desktop with three tabs.
      ...(tag ? { tag, renotify: false } : {}),
    } as NotificationOptions);
    if (click) notification.onclick = () => window.location.assign(click);
  }
}

const ACTIVE_SET_DEBOUNCE_MS = 300;
const RECORDED_DEDUPE_MS = 5_000;
const RECORDED_DEDUPE_LIMIT = 500;
const RECORDED_DEDUPE_TTL_MS = 60_000;

export interface RecordedNotifyEvent {
  type?: string;
  properties?: Record<string, unknown>;
  click?: string;
}

/**
 * Everything the watcher decides for one SSE frame, minus the EventSource:
 * ring only for the server's own verdict, drop a repeat of one already rung,
 * and otherwise play this device's media.
 *
 * Extracted so the suppression rule above is reachable from a unit test.
 * `recordedKind` returning null for a suppressed record is the entire fix for
 * being pinged about sub-agent chatter and auto-approved permissions, and
 * nothing exercised it end to end: a regression there is silent in every other
 * test, and loud on the user's desk.
 *
 * Returns the kind that rang, or null.
 */
export function createRecordedMediaSink(): (
  event: RecordedNotifyEvent,
  preferences: NotificationPreferences,
  devicePreferences: DeviceNotificationPreferences,
  fallbackKey?: string,
) => NotifyEvent | null {
  const seen = new Map<string, number>();
  return (event, preferences, devicePreferences, fallbackKey) => {
    // Only the server's post-append verdict rings a bell. Raw upstream
    // events are still forwarded for the transcript and the sub-agent
    // ledger — this hook simply stops forming its own opinion about them.
    if (event.type !== "notification.recorded") return null;
    const properties = event.properties ?? {};
    const kind = recordedKind(properties);
    if (!kind) return null;
    // The record id is an exact identity, so this is now a guard against a
    // duplicate SSE frame rather than the heuristic it replaced.
    const key = String(properties.id ?? fallbackKey);
    const now = Date.now();
    if (now - (seen.get(key) ?? 0) < RECORDED_DEDUPE_MS) return null;
    seen.set(key, now);
    if (seen.size > RECORDED_DEDUPE_LIMIT) {
      for (const [seenKey, timestamp] of seen) {
        if (now - timestamp > RECORDED_DEDUPE_TTL_MS) seen.delete(seenKey);
      }
    }
    const title = typeof properties.sessionTitle === "string" && properties.sessionTitle
      ? properties.sessionTitle
      : undefined;
    const click = typeof properties.click === "string" ? properties.click : event.click;
    notifyBrowser(preferences, kind, title, click, devicePreferences, key);
    return kind;
  };
}

/**
 * One app-level listener. SSE is a nudge; notification preferences stay
 * server-backed.
 *
 * `onActiveSetChanged` fires (debounced) for events that can add a notification,
 * so the badge can refetch from the server
 * without this hook's consumer opening a second EventSource.
 */
export function useNotifyWatcher(onActiveSetChanged?: () => void): void {
  // Kept in a ref so the effect can stay mounted for the app's lifetime
  // instead of tearing the stream down whenever the callback identity changes.
  const notifyActiveSet = useRef(onActiveSetChanged);
  notifyActiveSet.current = onActiveSetChanged;

  useEffect(() => {
    if (PUBLIC_SIMULATOR) return;
    let preferences: NotificationPreferences | null = null;
    let devicePreferences: DeviceNotificationPreferences = loadDeviceNotificationPreferences().preferences;
    const sink = createRecordedMediaSink();
    let activeSetTimer: ReturnType<typeof setTimeout> | undefined;
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
      let event: RecordedNotifyEvent;
      try {
        event = JSON.parse(message.data) as RecordedNotifyEvent;
      } catch {
        return;
      }
      if (!event.type) return;
      // Ahead of the preferences guard on purpose: the badge must still track
      // outstanding work during the first paint, before preferences load.
      if (ACTIVE_SET_EVENTS.has(event.type)) {
        if (activeSetTimer) clearTimeout(activeSetTimer);
        // One agent turn can emit several of these; coalesce into one refetch.
        activeSetTimer = setTimeout(() => notifyActiveSet.current?.(), ACTIVE_SET_DEBOUNCE_MS);
      }
      if (!preferences) return;
      sink(event, preferences, devicePreferences, message.lastEventId);
    };
    return () => {
      if (activeSetTimer) clearTimeout(activeSetTimer);
      source.close();
      window.removeEventListener("opencode-notification-preferences", refreshPreferences);
      window.removeEventListener(NOTIFICATION_MEDIA_CHANGE_EVENT, refreshDevicePreferences);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);
}
