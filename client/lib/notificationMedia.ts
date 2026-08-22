import type { NotifyEvent } from "./api.js";

export const NOTIFICATION_MEDIA_STORAGE_KEY = "opencode-notification-media-v1";
export const NOTIFICATION_MEDIA_CHANGE_EVENT = "opencode-notification-media-preferences";
export const SOUND_PROFILES = ["subtle", "distinct", "minimal"] as const;
export type SoundProfile = (typeof SOUND_PROFILES)[number];

export interface DeviceNotificationPreferences {
  version: 1;
  sound: {
    enabled: boolean;
    volume: number;
    profile: SoundProfile;
    events: Record<NotifyEvent, boolean>;
  };
  speech: {
    enabled: boolean;
    rate: number;
  };
}

export type DeviceNotificationPreferenceLoadState = "absent" | "present" | "corrupt" | "unavailable";

export interface DeviceNotificationPreferenceLoadResult {
  state: DeviceNotificationPreferenceLoadState;
  preferences: DeviceNotificationPreferences;
}

export interface DeviceNotificationPreferenceInitialization extends DeviceNotificationPreferenceLoadResult {
  migrated: boolean;
}

export interface Tone {
  frequency: number;
  offset: number;
  duration: number;
  type: OscillatorType;
}

const EVENTS: NotifyEvent[] = ["idle", "error", "abort", "permission", "question", "parked", "pty"];
// "abort" is noise on a deliberate stop; "pty" is an audit kind whose ping is
// opt-in, matching the server default in notifications/preferences.ts.
const QUIET_BY_DEFAULT = new Set<NotifyEvent>(["abort", "pty"]);
const DEFAULT_EVENTS = Object.fromEntries(EVENTS.map((event) => [event, !QUIET_BY_DEFAULT.has(event)])) as Record<NotifyEvent, boolean>;

export const DEFAULT_DEVICE_NOTIFICATION_PREFERENCES: DeviceNotificationPreferences = {
  version: 1,
  sound: { enabled: false, volume: 0.5, profile: "distinct", events: { ...DEFAULT_EVENTS } },
  speech: { enabled: false, rate: 1 },
};

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

export function normalizeDeviceNotificationPreferences(value: unknown): DeviceNotificationPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sound = source.sound && typeof source.sound === "object" ? source.sound as Record<string, unknown> : {};
  const speech = source.speech && typeof source.speech === "object" ? source.speech as Record<string, unknown> : {};
  const eventSource = sound.events && typeof sound.events === "object" ? sound.events as Record<string, unknown> : {};
  const profile = SOUND_PROFILES.includes(sound.profile as SoundProfile) ? sound.profile as SoundProfile : "distinct";
  return {
    version: 1,
    sound: {
      enabled: sound.enabled === true,
      volume: clamp(sound.volume, 0, 1, 0.5),
      profile,
      events: Object.fromEntries(EVENTS.map((event) => [
        event,
        typeof eventSource[event] === "boolean" ? eventSource[event] : DEFAULT_EVENTS[event],
      ])) as Record<NotifyEvent, boolean>,
    },
    speech: {
      enabled: speech.enabled === true,
      rate: clamp(speech.rate, 0.7, 1.3, 1),
    },
  };
}

export function loadDeviceNotificationPreferences(storage?: Pick<Storage, "getItem">): DeviceNotificationPreferenceLoadResult {
  try {
    const target = storage ?? localStorage;
    const raw = target.getItem(NOTIFICATION_MEDIA_STORAGE_KEY);
    if (raw === null) {
      return { state: "absent", preferences: normalizeDeviceNotificationPreferences(null) };
    }
    try {
      return { state: "present", preferences: normalizeDeviceNotificationPreferences(JSON.parse(raw)) };
    } catch {
      return { state: "corrupt", preferences: normalizeDeviceNotificationPreferences(null) };
    }
  } catch {
    return { state: "unavailable", preferences: normalizeDeviceNotificationPreferences(null) };
  }
}

export function resolveDeviceNotificationPreferences(
  loaded: DeviceNotificationPreferenceLoadResult,
  legacy: { sound: boolean; volume: number },
): DeviceNotificationPreferenceInitialization {
  if (loaded.state !== "absent") return { ...loaded, migrated: false };
  return {
    state: "present",
    migrated: true,
    preferences: normalizeDeviceNotificationPreferences({
      ...loaded.preferences,
      sound: {
        ...loaded.preferences.sound,
        enabled: legacy.sound,
        volume: legacy.volume,
      },
    }),
  };
}

export function initializeDeviceNotificationPreferences(
  legacy: { sound: boolean; volume: number },
  storage?: Pick<Storage, "getItem" | "setItem">,
): DeviceNotificationPreferenceInitialization {
  const loaded = loadDeviceNotificationPreferences(storage);
  const initialized = resolveDeviceNotificationPreferences(loaded, legacy);
  if (loaded.state !== "unavailable") saveDeviceNotificationPreferences(initialized.preferences, storage);
  return initialized;
}

export function saveDeviceNotificationPreferences(
  preferences: DeviceNotificationPreferences,
  storage?: Pick<Storage, "setItem">,
): DeviceNotificationPreferences {
  const normalized = normalizeDeviceNotificationPreferences(preferences);
  try {
    (storage ?? localStorage).setItem(NOTIFICATION_MEDIA_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be blocked by browser privacy settings; in-memory settings still work.
  }
  return normalized;
}

export function notificationPhrase(event: NotifyEvent): string | null {
  switch (event) {
    case "idle": return "Session finished";
    case "error": return "Session failed";
    case "permission": return "OpenCode needs permission";
    case "question": return "OpenCode asked a question";
    case "parked": return "Session is waiting for approval";
    case "pty": return "Terminal activity";
    case "abort": return null;
  }
}

const DISTINCT_FREQUENCIES: Record<NotifyEvent, number[]> = {
  idle: [523, 659],
  error: [330, 220],
  abort: [294],
  permission: [440, 587],
  question: [494, 659, 587],
  parked: [392, 392, 523],
  pty: [349, 466],
};

export function tonePattern(event: NotifyEvent, profile: SoundProfile): Tone[] {
  const frequencies = profile === "minimal" ? DISTINCT_FREQUENCIES[event].slice(0, 1) : DISTINCT_FREQUENCIES[event];
  const duration = profile === "subtle" ? 0.075 : profile === "minimal" ? 0.1 : 0.11;
  const gap = profile === "subtle" ? 0.085 : 0.13;
  return frequencies.map((frequency, index) => ({
    frequency: profile === "subtle" ? Math.round(frequency * 0.82) : frequency,
    offset: index * gap,
    duration,
    type: profile === "distinct" && event === "error" ? "sawtooth" : "sine",
  }));
}
