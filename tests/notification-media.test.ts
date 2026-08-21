import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEVICE_NOTIFICATION_PREFERENCES,
  initializeDeviceNotificationPreferences,
  loadDeviceNotificationPreferences,
  notificationPhrase,
  normalizeDeviceNotificationPreferences,
  NOTIFICATION_MEDIA_STORAGE_KEY,
  tonePattern,
} from "../client/lib/notificationMedia.js";

describe("device notification media preferences", () => {
  function memoryStorage(initial?: string) {
    const values = new Map<string, string>();
    if (initial !== undefined) values.set(NOTIFICATION_MEDIA_STORAGE_KEY, initial);
    return {
      values,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
  }

  it("clamps loaded values and restores missing event defaults", () => {
    const preferences = normalizeDeviceNotificationPreferences({
      sound: { enabled: true, volume: 9, profile: "unknown", events: { idle: false } },
      speech: { enabled: true, rate: -2 },
    });

    expect(preferences.sound).toMatchObject({ enabled: true, volume: 1, profile: "distinct" });
    expect(preferences.sound.events.idle).toBe(false);
    expect(preferences.sound.events.permission).toBe(true);
    expect(preferences.speech).toEqual({ enabled: true, rate: 0.7 });
  });

  it("migrates legacy sound only when device storage is absent", () => {
    const storage = memoryStorage();
    const loaded = loadDeviceNotificationPreferences(storage);
    expect(loaded.state).toBe("absent");
    expect(storage.values.has(NOTIFICATION_MEDIA_STORAGE_KEY)).toBe(false);

    const initialized = initializeDeviceNotificationPreferences({ sound: true, volume: 0.85 }, storage);
    expect(initialized.migrated).toBe(true);
    expect(initialized.preferences.sound).toMatchObject({ enabled: true, volume: 0.85 });
    expect(JSON.parse(storage.values.get(NOTIFICATION_MEDIA_STORAGE_KEY) ?? "null").sound.volume).toBe(0.85);
  });

  it("preserves a present device preference over legacy sound", () => {
    const existing = normalizeDeviceNotificationPreferences({ sound: { enabled: false, volume: 0.2, profile: "minimal" } });
    const storage = memoryStorage(JSON.stringify(existing));
    const initialized = initializeDeviceNotificationPreferences({ sound: true, volume: 0.9 }, storage);

    expect(initialized.migrated).toBe(false);
    expect(initialized.preferences.sound).toMatchObject({ enabled: false, volume: 0.2, profile: "minimal" });
  });

  it("resets corrupt storage without migrating legacy sound", () => {
    const storage = memoryStorage("not-json");
    const initialized = initializeDeviceNotificationPreferences({ sound: true, volume: 0.9 }, storage);

    expect(initialized).toMatchObject({ state: "corrupt", migrated: false });
    expect(initialized.preferences).toEqual(DEFAULT_DEVICE_NOTIFICATION_PREFERENCES);
    expect(JSON.parse(storage.values.get(NOTIFICATION_MEDIA_STORAGE_KEY) ?? "null")).toEqual(DEFAULT_DEVICE_NOTIFICATION_PREFERENCES);
  });

  it("maps only privacy-safe generic phrases", () => {
    expect(notificationPhrase("idle")).toBe("Session finished");
    expect(notificationPhrase("permission")).toBe("OpenCode needs permission");
    expect(notificationPhrase("question")).toBe("OpenCode asked a question");
    expect(notificationPhrase("error")).toBe("Session failed");
    expect(notificationPhrase("parked")).toBe("Session is waiting for approval");
    expect(notificationPhrase("abort")).toBeNull();
  });

  it("produces bounded, deterministic, distinct patterns", () => {
    const idle = tonePattern("idle", "distinct");
    const permission = tonePattern("permission", "distinct");
    expect(idle).not.toEqual(permission);
    expect(tonePattern("idle", "distinct")).toEqual(idle);
    expect(idle.every((tone) => tone.duration <= 0.14 && tone.offset <= 0.65)).toBe(true);
    expect(tonePattern("question", "minimal")).toHaveLength(1);
  });
});
