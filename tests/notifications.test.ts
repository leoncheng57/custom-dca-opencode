import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyEvent } from "../server/notifications/service.js";
import {
  normalizePreferences,
  PreferenceStore,
} from "../server/notifications/preferences.js";
import { sendNtfy } from "../server/notifications/ntfy.js";

afterEach(() => vi.unstubAllGlobals());

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
    expect(() => normalizePreferences({ ntfy: { server: "https://user:secret@ntfy.sh", topic: "ok" } })).toThrow();
    expect(() => normalizePreferences({ ntfy: { server: "https://ntfy.sh?next=evil", topic: "ok" } })).toThrow();
    expect(() => normalizePreferences({ ntfy: { server: "https://ntfy.sh", topic: "bad/topic" } })).toThrow();
  });
});

describe("ntfy delivery", () => {
  it("sends credentials and an encoded click URL only to the trusted origin", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const preferences = normalizePreferences({ ntfy: { enabled: true, server: "https://ntfy.sh", topic: "team" } });
    const click = "https://ide.example.test/sessions/ses%2Fa?directory=%2Ftmp%2Fproject+one";
    await sendNtfy(preferences, { event: "question", title: "Question", body: "Review it", click }, "secret");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ntfy.sh/team");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret", Click: click });
    expect(init?.redirect).toBe("manual");

    await expect(sendNtfy(
      { ...preferences, ntfy: { ...preferences.ntfy, server: "https://evil.example" } },
      { event: "question", title: "Question", body: "Review it" },
      "secret",
    )).rejects.toThrow("untrusted origin");
    expect(fetchMock).toHaveBeenCalledOnce();
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
