import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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

  it("logs an auto-approved permission without letting it hold the badge", async () => {
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
    expect(record.resolvedBy).toBe("suppressed");
    expect(await history.activeCount()).toBe(0);
    service.stop();
  });
});

describe("notification history", () => {
  it("counts only unresolved permission and question records", async () => {
    const history = historyStore();
    const delivery = { ntfy: "off", browser: "allowed" } as const;
    await history.append({ kind: "idle", title: "idle", body: "", delivery });
    await history.append({ kind: "error", title: "error", body: "", delivery });
    await history.append({ kind: "permission", requestID: "perm_1", title: "perm", body: "", delivery });
    await history.append({ kind: "question", requestID: "que_1", title: "question", body: "", delivery });

    expect(await history.activeCount()).toBe(2);
    await history.resolve((record) => record.requestID === "perm_1", "replied");
    expect(await history.activeCount()).toBe(1);
    expect((await history.list({ state: "active" })).map((record) => record.requestID)).toEqual(["que_1"]);
  });

  it("keeps active records when resolved ones are cleared", async () => {
    const history = historyStore();
    const delivery = { ntfy: "off", browser: "off" } as const;
    await history.append({ kind: "idle", title: "idle", body: "", delivery });
    await history.append({ kind: "permission", requestID: "perm_1", title: "perm", body: "", delivery });

    expect(await history.clearResolved()).toBe(1);
    expect((await history.list()).map((record) => record.kind)).toEqual(["permission"]);
    expect(await history.activeCount()).toBe(1);
  });

  it("caps the ring buffer and round-trips through disk", async () => {
    const file = path.join(os.tmpdir(), `dca-history-cap-${Date.now()}.json`);
    const history = new HistoryStore(file, 3);
    const delivery = { ntfy: "off", browser: "off" } as const;
    for (const index of [1, 2, 3, 4, 5]) {
      await history.append({ kind: "idle", title: `idle ${index}`, body: "", delivery });
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
    await history.append({ kind: "idle", title: "idle", body: "", delivery: { ntfy: "off", browser: "off" } });
    expect(await history.list()).toHaveLength(1);
  });

  it("escalates a parked permission without counting it twice", async () => {
    const history = historyStore();
    const delivery = { ntfy: "sent", browser: "allowed" } as const;
    await history.append({
      kind: "permission",
      directory: "/tmp/project",
      requestID: "perm_1",
      title: "perm",
      body: "",
      delivery,
    });
    // The parked alert is a second ntfy push about the same outstanding ask.
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
    expect(await history.activeCount()).toBe(1);
    const permission = (await history.list()).find((record) => record.kind === "permission");
    expect(permission?.parkedAt).toBeTypeOf("number");
  });

  it("retires actionable records too old to reconcile", async () => {
    const history = historyStore();
    await history.append({
      kind: "permission",
      requestID: "perm_old",
      title: "perm",
      body: "",
      delivery: { ntfy: "off", browser: "off" },
    });
    expect(await history.activeCount()).toBe(1);
    await history.expireStale(Date.now() + 25 * 60 * 60 * 1000);
    expect(await history.activeCount()).toBe(0);
    expect((await history.list())[0].resolvedBy).toBe("stale");
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

  it("clears the badge when the permission is replied to", async () => {
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
    await vi.waitFor(async () => expect(await history.activeCount()).toBe(0));
    expect((await history.list())[0].resolvedBy).toBe("replied");
    service.stop();
  });

  it("reconciles an active record whose upstream request has gone", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-projects-"));
    const directory = path.join(root, "project");
    await mkdir(directory);
    vi.stubEnv("PROJECTS_DIR", root);
    // Empty /permission and /question mean both requests were answered while
    // this process was not listening.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));

    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    const delivery = { ntfy: "off", browser: "off" } as const;
    await history.append({ kind: "permission", directory, requestID: "perm_gone", title: "perm", body: "", delivery });
    await history.append({ kind: "question", directory, requestID: "que_gone", title: "question", body: "", delivery });
    expect(await history.activeCount()).toBe(2);

    const service = new NotificationService({ baseUrl: "http://opencode.test" }, bus, ntfyPreferences(), history);
    await service.reconcileAll(true);
    expect(await history.activeCount()).toBe(0);
    expect((await history.list()).every((record) => record.resolvedBy === "reconciled")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("leaves records alone when the upstream lookup fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-projects-"));
    const directory = path.join(root, "project");
    await mkdir(directory);
    vi.stubEnv("PROJECTS_DIR", root);
    // A lookup failure is not evidence of a reply; the badge must survive it.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));

    const history = historyStore();
    await history.append({
      kind: "permission",
      directory,
      requestID: "perm_unknown",
      title: "perm",
      body: "",
      delivery: { ntfy: "off", browser: "off" },
    });
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      new EventEmitter() as EventBus,
      ntfyPreferences(),
      history,
    );
    await service.reconcileAll(true);
    expect(await history.activeCount()).toBe(1);
    vi.unstubAllEnvs();
  });
});
