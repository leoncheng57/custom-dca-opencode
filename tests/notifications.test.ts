import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyEvent } from "../server/notifications/service.js";
import {
  normalizePreferences,
  PreferenceStore,
} from "../server/notifications/preferences.js";

describe("notification preferences", () => {
  it("normalises independent event channels and clamps values", () => {
    const value = normalizePreferences({
      browser: { sound: true, volume: 2, events: { idle: false } },
      ntfy: { server: "https://ntfy.sh", topic: "valid-topic", events: { parked: false } },
      parkedPermissionSeconds: 1,
    });
    expect(value.browser.volume).toBe(1);
    expect(value.browser.events.idle).toBe(false);
    expect(value.ntfy.events.idle).toBe(true);
    expect(value.ntfy.events.parked).toBe(false);
    expect(value.parkedPermissionSeconds).toBe(5);
  });

  it("atomically round-trips and recovers from malformed JSON", async () => {
    const file = path.join(os.tmpdir(), `dca-prefs-${Date.now()}.json`);
    const store = new PreferenceStore(file);
    const saved = await store.write({ ntfy: { server: "https://ntfy.sh", topic: "team" } });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(saved);
    await import("node:fs/promises").then(({ writeFile }) => writeFile(file, "not json"));
    expect((await store.read()).version).toBe(1);
  });

  it("rejects unsafe ntfy destinations and topics", () => {
    expect(() => normalizePreferences({ ntfy: { server: "file:///etc", topic: "ok" } })).toThrow();
    expect(() => normalizePreferences({ ntfy: { server: "https://ntfy.sh/path", topic: "ok" } })).toThrow();
    expect(() => normalizePreferences({ ntfy: { server: "https://ntfy.sh", topic: "bad/topic" } })).toThrow();
  });
});

describe("notification event classification", () => {
  it("distinguishes abort from an agent error", () => {
    expect(classifyEvent({ type: "session.error", properties: { error: { name: "MessageAbortedError" } } })).toBe("abort");
    expect(classifyEvent({ type: "session.error", properties: { error: { name: "ProviderError" } } })).toBe("error");
  });

  it("ignores unknown events", () => {
    expect(classifyEvent({ type: "server.heartbeat", properties: {} })).toBeNull();
  });
});
