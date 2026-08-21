import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEVICE_NOTIFICATION_PREFERENCES,
  loadDeviceNotificationPreferences,
  notificationPhrase,
  normalizeDeviceNotificationPreferences,
  NOTIFICATION_MEDIA_STORAGE_KEY,
  tonePattern,
} from "../client/lib/notificationMedia.js";

describe("device notification media preferences", () => {
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

  it("resets corrupt storage to normalized defaults", () => {
    const values = new Map([[NOTIFICATION_MEDIA_STORAGE_KEY, "not-json"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    expect(loadDeviceNotificationPreferences(storage)).toEqual(DEFAULT_DEVICE_NOTIFICATION_PREFERENCES);
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
