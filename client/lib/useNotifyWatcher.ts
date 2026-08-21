import { useEffect, useRef } from "react";

import { api, type NotificationPreferences, type NotifyEvent } from "./api.js";
import { ACTIVE_SET_EVENTS } from "./useNotificationCenter.js";

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

function play(volume: number): void {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.08;
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
  oscillator.addEventListener("ended", () => void context.close());
}

export function notifyBrowser(
  preferences: NotificationPreferences,
  event: NotifyEvent,
  title = `OpenCode: ${event}`,
  click?: string,
): void {
  if (!preferences.browser.events[event]) return;
  if (preferences.browser.sound) play(preferences.browser.volume);
  if (
    preferences.browser.desktop &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    const notification = new Notification(title, { body: "Open the IDE to review the session." });
    if (click) notification.onclick = () => window.location.assign(click);
  }
}

const ACTIVE_SET_DEBOUNCE_MS = 300;

/**
 * One app-level listener. SSE is a nudge; notification preferences stay
 * server-backed.
 *
 * `onActiveSetChanged` fires (debounced) for events that can add or clear an
 * outstanding permission/question, so the badge can refetch from the server
 * without this hook's consumer opening a second EventSource.
 */
export function useNotifyWatcher(onActiveSetChanged?: () => void): void {
  // Kept in a ref so the effect can stay mounted for the app's lifetime
  // instead of tearing the stream down whenever the callback identity changes.
  const notifyActiveSet = useRef(onActiveSetChanged);
  notifyActiveSet.current = onActiveSetChanged;

  useEffect(() => {
    let preferences: NotificationPreferences | null = null;
    const seen = new Map<string, number>();
    let activeSetTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshPreferences = () => void api.notifications().then((result) => {
      preferences = result.preferences;
    }).catch(() => undefined);
    refreshPreferences();
    window.addEventListener("opencode-notification-preferences", refreshPreferences);
    const source = new EventSource(api.eventsUrl());
    source.onmessage = (message) => {
      let event: { type?: string; properties?: Record<string, unknown>; click?: string };
      try {
        event = JSON.parse(message.data) as typeof event;
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
      notifyBrowser(preferences, kind, undefined, event.click);
    };
    return () => {
      if (activeSetTimer) clearTimeout(activeSetTimer);
      source.close();
      window.removeEventListener("opencode-notification-preferences", refreshPreferences);
    };
  }, []);
}
