import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyEvent, NotificationService } from "../server/notifications/service.js";
import type { EventBus } from "../server/opencode/events.js";
import { HistoryStore } from "../server/notifications/history.js";
import {
  normalizePreferences,
  PreferenceStore,
} from "../server/notifications/preferences.js";
import { sendNtfy } from "../server/notifications/ntfy.js";

afterEach(() => vi.unstubAllGlobals());

let historySequence = 0;
function historyStore(limit?: number): HistoryStore {
  const file = path.join(os.tmpdir(), `dca-history-${process.pid}-${(historySequence += 1)}-${Date.now()}.json`);
  return limit === undefined ? new HistoryStore(file) : new HistoryStore(file, limit);
}

function ntfyPreferences(): PreferenceStore {
  return {
    read: async () => normalizePreferences({ ntfy: { enabled: true, server: "https://ntfy.sh", topic: "team" } }),
  } as PreferenceStore;
}

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

describe("auto permission notification suppression", () => {
  const asked = {
    type: "permission.asked",
    directory: "/tmp/enabled",
    properties: {
      id: "perm_test",
      sessionID: "ses_test",
      permission: "bash",
      patterns: ["npm test"],
      metadata: {},
      always: [],
    },
  };

  it("suppresses permission notifications only in enabled directories", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const bus = new EventEmitter() as EventBus;
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      ntfyPreferences(),
      historyStore(),
      null,
      (directory) => directory === "/tmp/enabled",
    );
    service.start();

    bus.emit("event", asked);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).not.toHaveBeenCalled();

    bus.emit("event", { ...asked, directory: "/tmp/disabled", properties: { ...asked.properties, id: "perm_other" } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    service.stop();
  });

  it("does not suppress questions in an auto-enabled directory", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const bus = new EventEmitter() as EventBus;
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      ntfyPreferences(),
      historyStore(),
      null,
      () => true,
    );
    service.start();
    bus.emit("event", { type: "question.asked", directory: "/tmp/enabled", properties: { id: "que_test", sessionID: "ses_test" } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    service.stop();
  });

  it("logs an auto-approved permission for the user to resolve", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      ntfyPreferences(),
      history,
      null,
      () => true,
    );
    service.start();
    bus.emit("event", asked);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    const [record] = await history.list();
    expect(record.delivery.suppressed).toBe("auto-permissions");
    expect(record.resolvedAt).toBeUndefined();
    expect(await history.activeCount()).toBe(1);
    service.stop();
  });
});

describe("notification history", () => {
  it("counts every unresolved notification until the user checks it", async () => {
    const history = historyStore();
    const delivery = { ntfy: "off", desktop: "allowed" } as const;
    await history.append({ kind: "idle", title: "idle", body: "", delivery });
    await history.append({ kind: "error", title: "error", body: "", delivery });
    await history.append({ kind: "permission", requestID: "perm_1", title: "perm", body: "", delivery });
    await history.append({ kind: "question", requestID: "que_1", title: "question", body: "", delivery });

    expect(await history.activeCount()).toBe(4);
    const permission = (await history.list()).find((record) => record.requestID === "perm_1")!;
    await history.setResolved(permission.id, true);
    expect(await history.activeCount()).toBe(3);
    expect((await history.list({ state: "resolved" }))[0].resolvedBy).toBe("checked");
    await history.setResolved(permission.id, false);
    expect(await history.activeCount()).toBe(4);
  });

  it("caps the ring buffer and round-trips through disk", async () => {
    const file = path.join(os.tmpdir(), `dca-history-cap-${Date.now()}.json`);
    const history = new HistoryStore(file, 3);
    const delivery = { ntfy: "off", desktop: "off" } as const;
    for (const index of [1, 2, 3, 4, 5]) {
      const record = await history.append({ kind: "idle", title: `idle ${index}`, body: "", delivery });
      await history.setResolved(record.id, true);
    }
    await history.flush();

    expect((await history.list()).map((record) => record.title)).toEqual(["idle 5", "idle 4", "idle 3"]);
    const persisted = JSON.parse(await readFile(file, "utf8")) as { records: unknown[] };
    expect(persisted.records).toHaveLength(3);
    expect((await new HistoryStore(file, 3).list()).map((r) => (r as { title: string }).title)).toEqual([
      "idle 5",
      "idle 4",
      "idle 3",
    ]);
  });

  it("starts empty rather than throwing on a malformed history file", async () => {
    const file = path.join(os.tmpdir(), `dca-history-bad-${Date.now()}.json`);
    await writeFile(file, "not json");
    const history = new HistoryStore(file);
    expect(await history.list()).toEqual([]);
    await history.append({ kind: "idle", title: "idle", body: "", delivery: { ntfy: "off", desktop: "off" } });
    expect(await history.list()).toHaveLength(1);
  });

  it("persists user resolution and reopening across store instances", async () => {
    const file = path.join(os.tmpdir(), `dca-history-resolution-${Date.now()}.json`);
    const history = new HistoryStore(file);
    const record = await history.append({
      kind: "idle",
      title: "idle",
      body: "",
      delivery: { ntfy: "off", desktop: "off" },
    });
    await history.setResolved(record.id, true);
    await history.flush();

    const reloaded = new HistoryStore(file);
    expect((await reloaded.list())[0]).toMatchObject({ id: record.id, resolvedBy: "checked" });
    await reloaded.setResolved(record.id, false);
    await reloaded.flush();
    expect((await new HistoryStore(file).list())[0].resolvedAt).toBeUndefined();
  });

  it("records a parked escalation as its own unresolved notification", async () => {
    const history = historyStore();
    const delivery = { ntfy: "sent", desktop: "allowed" } as const;
    await history.append({
      kind: "permission",
      directory: "/tmp/project",
      requestID: "perm_1",
      title: "perm",
      body: "",
      delivery,
    });
    // The parked alert is a second notification and therefore a second item
    // in the user's unresolved checklist.
    await history.append({
      kind: "parked",
      directory: "/tmp/project",
      requestID: "perm_1",
      title: "parked",
      body: "",
      delivery,
    });
    expect(await history.markParked("/tmp/project", "perm_1")).toBe(true);

    expect(await history.list()).toHaveLength(2);
    expect(await history.activeCount()).toBe(2);
    const permission = (await history.list()).find((record) => record.kind === "permission");
    expect(permission?.parkedAt).toBeTypeOf("number");
  });

  it("retains active records beyond the ring limit", async () => {
    const history = historyStore(3);
    const delivery = { ntfy: "off", desktop: "off" } as const;
    for (const requestID of ["perm_1", "perm_2", "perm_3", "perm_4"]) {
      await history.append({ kind: "permission", requestID, title: requestID, body: "", delivery });
    }
    await history.append({ kind: "idle", title: "unresolved info", body: "", delivery });

    expect(await history.activeCount()).toBe(5);
    expect(await history.list()).toHaveLength(5);
  });
});

describe("notification resolution", () => {
  const asked = {
    type: "permission.asked",
    directory: "/tmp/project",
    properties: { id: "perm_1", sessionID: "ses_1", permission: "bash", patterns: [], metadata: {}, always: [] },
  };

  it("records a delivery failure without losing the notification", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    const service = new NotificationService({ baseUrl: "http://opencode.test" }, bus, ntfyPreferences(), history);
    service.start();
    bus.emit("event", asked);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    const [record] = await history.list();
    expect(record.delivery.ntfy).toBe("failed");
    expect(record.delivery.ntfyError).toContain("500");
    expect(await history.activeCount()).toBe(1);
    service.stop();
  });

  it("keeps the badge until the user resolves it, even after a reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    const service = new NotificationService({ baseUrl: "http://opencode.test" }, bus, ntfyPreferences(), history);
    service.start();
    bus.emit("event", asked);
    await vi.waitFor(async () => expect(await history.activeCount()).toBe(1));

    bus.emit("event", {
      type: "permission.replied",
      directory: "/tmp/project",
      properties: { requestID: "perm_1" },
    });
    expect(await history.activeCount()).toBe(1);
    const [record] = await history.list();
    await history.setResolved(record.id, true);
    expect(await history.activeCount()).toBe(0);
    expect((await history.list())[0].resolvedBy).toBe("checked");
    service.stop();
  });
});
