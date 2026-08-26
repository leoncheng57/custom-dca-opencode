import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyEvent,
  NTFY_BODY_LIMIT,
  NTFY_TITLE_LIMIT,
  NotificationService,
  inAppMessage,
  outboundMessage,
} from "../server/notifications/service.js";
import type { EventBus } from "../server/opencode/events.js";
import { APP_BADGE_FILTERS, HistoryStore } from "../server/notifications/history.js";
import {
  normalizePreferences,
  mergePreferenceWrite,
  PreferenceStore,
} from "../server/notifications/preferences.js";
import { sendNtfy } from "../server/notifications/ntfy.js";
import type { SessionMetadata } from "../server/opencode/sessions.js";
import { NTFY_TEST_MESSAGE } from "../server/routes/notifications.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

const rootSession = async (_directory: string, sessionID: string): Promise<SessionMetadata> => ({ id: sessionID });

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
    expect(value.webPush.enabled).toBe(false);
    expect(value.webPush.events.idle).toBe(true);
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

  it("preserves Web Push when an older v1 client saves without that field", () => {
    const current = normalizePreferences({ webPush: { enabled: true, events: { idle: false } } });
    const merged = normalizePreferences(mergePreferenceWrite(current, {
      version: 1,
      ntfy: { enabled: false, server: "https://ntfy.sh", topic: "" },
      browser: current.browser,
      parkedPermissionSeconds: 45,
    }));
    expect(merged.webPush).toEqual(current.webPush);
    expect(merged.parkedPermissionSeconds).toBe(45);
  });

  it("serializes current and legacy preference saves without losing Web Push", async () => {
    const file = path.join(os.tmpdir(), `dca-prefs-concurrent-${Date.now()}.json`);
    const store = new PreferenceStore(file);
    await store.write({ webPush: { enabled: false } });
    await Promise.all([
      store.update({ parkedPermissionSeconds: 45 }),
      store.update({ parkedPermissionSeconds: 60, webPush: { enabled: true } }),
      store.update({ parkedPermissionSeconds: 90 }),
    ]);
    expect(await store.read()).toMatchObject({ parkedPermissionSeconds: 90, webPush: { enabled: true } });
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
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret", Click: click, Tags: "question" });
    expect(init?.redirect).toBe("manual");

    await expect(sendNtfy(
      { ...preferences, ntfy: { ...preferences.ntfy, server: "https://evil.example" } },
      { event: "question", title: "Question", body: "Review it" },
      "secret",
    )).rejects.toThrow("untrusted origin");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("outbound ntfy copy", () => {
  const event = (type: string, properties: Record<string, unknown> = {}) => ({
    type,
    directory: "/tmp/project",
    properties: { sessionID: "ses_private", ...properties },
  });

  it("uses a compact session title capped for the lock screen", () => {
    const message = outboundMessage(
      event("session.idle"),
      "idle",
      `  Rewrite   notifications ${"x".repeat(100)}  `,
    );
    expect(message.title).toBe(`Rewrite notifications ${"x".repeat(55)}...`);
    expect(message.title).toHaveLength(NTFY_TITLE_LIMIT);
    expect(message.body).toBe("Finished its turn and is waiting for you");
  });

  it.each([
    ["permission", event("permission.asked", { permission: "bash" }), "\u{1F510} Needs approval to run bash"],
    ["question", event("question.asked", {
      id: "que_1",
      questions: [{ question: "Which release should I deploy?", header: "Release", options: [] }],
    }), "\u{2753} Needs your answer: Which release should I deploy?"],
    ["idle", event("session.idle"), "Finished its turn and is waiting for you"],
    ["error", event("session.error", { error: { name: "ProviderError" } }), "\u{26A0}\u{FE0F} Stopped with an error: ProviderError"],
    ["abort", event("session.error", { error: { name: "MessageAbortedError" } }), "Stopped at your request"],
  ] as const)("uses approved %s copy", (kind, notificationEvent, body) => {
    const message = outboundMessage(notificationEvent, kind, "Release work");
    expect(message.title).toBe("Release work");
    expect(message.body).toBe(body);
    expect(message.body.length).toBeLessThanOrEqual(NTFY_BODY_LIMIT);
  });

  it("falls back rather than exposing absent or unsafe details", () => {
    const permission = outboundMessage(event("permission.asked", {
      permission: "BASH /tmp/private",
      metadata: { output: "/tmp/private/output.txt", token: "sk-secret-token" },
      patterns: ["npm test -- --output /tmp/private/output.txt"],
    }), "permission", "ses_private");
    const question = outboundMessage(event("question.asked", {
      id: "que_1",
      questions: [{ question: "Use output=/tmp/private/output.txt with sk-secret-token?", header: "Secret", options: [] }],
    }), "question", undefined);
    const error = outboundMessage(event("session.error", {
      error: { name: "ProviderError", message: "failed at /tmp/private/output.txt with sk-secret-token" },
    }), "error", undefined);

    expect(permission).toMatchObject({ title: "OpenCode needs permission", body: "\u{1F510} Needs your approval" });
    expect(question.body).toBe("\u{2753} Needs your answer");
    expect(error.body).toBe("\u{26A0}\u{FE0F} Stopped with an error: ProviderError");
    expect(inAppMessage(event("question.asked", {
      id: "que_1",
      questions: [{ question: "Use output=/tmp/private/output.txt with sk-secret-token?", header: "Secret", options: [] }],
    }), "question")).toBe("Needs your answer");
    for (const message of [permission, question, error]) {
      expect(`${message.title} ${message.body}`).not.toMatch(/ses_private|\/tmp\/private|sk-secret-token|output\.txt/u);
    }
  });

  it("uses human-readable parked duration and a bounded body", () => {
    const message = outboundMessage(event("permission.asked", { permission: "bash" }), "parked", "Release work", 90);
    expect(message).toMatchObject({
      title: "Release work",
      body: "\u{23F3} Still waiting 1 minute 30 seconds for approval: bash",
      priority: "high",
    });
  });

  it("keeps the authenticated-app question context separate from the lock-screen cap", () => {
    const question = `Should I proceed with ${"the requested migration ".repeat(7)}?`;
    const notificationEvent = event("question.asked", {
      id: "que_1",
      questions: [{ question, header: "Migration", options: [] }],
    });

    expect(outboundMessage(notificationEvent, "question", "Release work").body).toBe("\u{2753} Needs your answer");
    expect(inAppMessage(notificationEvent, "question")).toBe(`Needs your answer: ${question}`);
  });

  it("keeps the explicit test-route title and revised confirmation copy", () => {
    expect(NTFY_TEST_MESSAGE).toEqual({
      event: "idle",
      title: "OpenCode notification test",
      body: "Your phone notification path is working.",
    });
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

describe("root session notification filtering", () => {
  const idle = (directory: string, sessionID: string) => ({
    type: "session.idle",
    directory,
    properties: { sessionID },
  });

  function startService(
    lookup: (directory: string, sessionID: string, signal: AbortSignal) => Promise<SessionMetadata | null>,
    excerpt: (directory: string, sessionID: string, signal: AbortSignal) => Promise<string | undefined> =
      async () => undefined,
  ) {
    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      ntfyPreferences(),
      history,
      null,
      undefined,
      lookup,
      undefined,
      excerpt,
    );
    service.start();
    return { bus, history, service };
  }

  it("records and delivers root session notifications", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const lookup = vi.fn(rootSession);
    const { bus, history, service } = startService(lookup);

    bus.emit("event", idle("/tmp/root", "ses_root"));

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledWith("/tmp/root", "ses_root", expect.any(AbortSignal));
    service.stop();
  });

  it.each([
    ["child", "ses_parent"],
    ["nested child", "ses_child"],
  ])("records a verified %s without delivering it or consuming the original event", async (_label, parentID) => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const lookup = vi.fn(async (_directory: string, sessionID: string) => ({ id: sessionID, parentID }));
    const { bus, history, service } = startService(lookup);
    const observed = vi.fn();
    bus.on("event", observed);

    bus.emit("event", idle("/tmp/project", "ses_descendant"));

    // Recorded so "did my delegated child ever finish?" stays answerable, but
    // never delivered: the parent owns its children's lifecycle.
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    expect(lookup).toHaveBeenCalledOnce();
    expect((await history.list())[0].delivery).toEqual({ ntfy: "off", desktop: "off", webPush: "off", suppressed: "subagent" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(observed).toHaveBeenCalledWith(idle("/tmp/project", "ses_descendant"));
    service.stop();
  });

  it("keeps sub-agent records out of the default badge count", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const lookup = vi.fn(async (_directory: string, sessionID: string) => ({
      id: sessionID,
      ...(sessionID === "ses_kid" ? { parentID: "ses_parent" } : {}),
    }));
    const { bus, history, service } = startService(lookup);

    bus.emit("event", idle("/tmp/project", "ses_kid"));
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    bus.emit("event", idle("/tmp/project", "ses_top"));
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(2));

    expect(await history.activeCount("/tmp/project")).toBe(2);
    expect(await history.activeCount("/tmp/project", { hideSubagent: true })).toBe(1);
    expect(await history.suppressedActiveCounts("/tmp/project")).toEqual({ "auto-permissions": 0, subagent: 1, "preference-off": 0 });
    service.stop();
  });

  it("fails open when session metadata is unknown", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { bus, history, service } = startService(async () => null);

    bus.emit("event", idle("/tmp/project", "ses_missing"));

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledOnce();
    service.stop();
  });

  it("fails open when the metadata lookup fails", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    const { bus, history, service } = startService(async () => { throw new Error("upstream unavailable"); });

    bus.emit("event", idle("/tmp/project", "ses_unavailable"));

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith("[notification-session]", "upstream unavailable");
    warning.mockRestore();
    service.stop();
  });

  it("keeps identical session IDs isolated by directory", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const lookup = vi.fn(async (directory: string, sessionID: string) => ({
      id: sessionID,
      ...(directory === "/tmp/child-project" ? { parentID: "ses_parent" } : {}),
    }));
    const { bus, history, service } = startService(lookup);

    bus.emit("event", idle("/tmp/child-project", "ses_shared"));
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    bus.emit("event", idle("/tmp/root-project", "ses_shared"));

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(2));
    // Same session id, opposite lineage: only the root one may be delivered.
    expect(await history.list({ hideSubagent: true })).toMatchObject([{ directory: "/tmp/root-project" }]);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    service.stop();
  });

  it("reuses verified lifecycle metadata without an upstream lookup", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const lookup = vi.fn(rootSession);
    const { bus, history, service } = startService(lookup);
    bus.emit("event", {
      type: "session.created",
      directory: "/tmp/project",
      properties: { info: { id: "ses_child", parentID: "ses_parent" } },
    });

    bus.emit("event", idle("/tmp/project", "ses_child"));

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await history.list())[0].delivery.suppressed).toBe("subagent");
    service.stop();
  });

  it("snapshots the session title observed from lifecycle events", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { bus, history, service } = startService(vi.fn(rootSession));
    bus.emit("event", {
      type: "session.updated",
      directory: "/tmp/project",
      properties: { info: { id: "ses_titled", title: "  Rewrite the   notification popover  " } },
    });

    bus.emit("event", idle("/tmp/project", "ses_titled"));

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    // Whitespace is normalised on parse; the record keeps what was true when
    // it fired, because the session may be renamed or deleted later.
    expect((await history.list())[0].sessionTitle).toBe("Rewrite the   notification popover");
    expect((await history.list())[0].displayBody).toBe("Finished its turn and is waiting for you");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Title: "Rewrite the notification popover" });
    service.stop();
  });

  it("omits the session title rather than inventing one", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { bus, history, service } = startService(vi.fn(rootSession));

    bus.emit("event", idle("/tmp/project", "ses_untitled"));

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    expect((await history.list())[0].sessionTitle).toBeUndefined();
    service.stop();
  });

  it("fails open without queueing more than four unique metadata lookups", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const resolvers: Array<(metadata: SessionMetadata) => void> = [];
    const lookup = vi.fn((_directory: string, sessionID: string) => new Promise<SessionMetadata>((resolve) => {
      resolvers.push((metadata) => resolve(metadata.id ? metadata : { id: sessionID }));
    }));
    const { bus, history, service } = startService(lookup);

    for (let index = 1; index <= 5; index += 1) {
      bus.emit("event", idle("/tmp/project", `ses_${index}`));
    }

    await vi.waitFor(async () => expect((await history.list()).some((item) => item.sessionID === "ses_5")).toBe(true));
    expect(lookup).toHaveBeenCalledTimes(4);
    resolvers.forEach((resolve, index) => resolve({ id: `ses_${index + 1}` }));
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(5));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    service.stop();
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
      rootSession,
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
      rootSession,
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
      rootSession,
    );
    service.start();
    bus.emit("event", asked);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    const [record] = await history.list();
    expect(record.delivery.suppressed).toBe("auto-permissions");
    expect(record.resolvedAt).toBeUndefined();
    expect(await history.activeCount()).toBe(1);
    // Kept in the log so "why was I never asked?" is answerable, but excluded
    // from the badge the moment the default filter is applied.
    expect(await history.activeCount(undefined, { hideAutoApproved: true })).toBe(0);
    expect(await history.list({ hideAutoApproved: true })).toEqual([]);
    service.stop();
  });
});

describe("over-notification", () => {
  const idleEvent = (directory: string, sessionID: string) => ({
    type: "session.idle",
    properties: { sessionID },
    directory,
  });

  function service(preferences: PreferenceStore, lookup = vi.fn(async () => null)) {
    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    const notifications = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      preferences,
      history,
      null,
      undefined,
      lookup as never,
      undefined,
      async () => undefined,
    );
    notifications.start();
    return { bus, history, notifications, lookup };
  }

  it("keeps an event kind switched off in every channel out of the badge", async () => {
    // Disabling a kind used to silence the ping while still adding a permanent
    // unresolved record — so the red number kept climbing for notifications the
    // user had explicitly asked not to receive.
    const store = {
      read: async () => {
        const base = normalizePreferences({ ntfy: { enabled: true, server: "https://ntfy.sh", topic: "team" } });
        return {
          ...base,
          ntfy: { ...base.ntfy, events: { ...base.ntfy.events, idle: false } },
          browser: { ...base.browser, events: { ...base.browser.events, idle: false } },
          webPush: { ...base.webPush, events: { ...base.webPush.events, idle: false } },
        };
      },
    } as PreferenceStore;
    const { bus, history, notifications } = service(store);

    bus.emit("event", idleEvent("/tmp/quiet", "ses_quiet"));
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    const [record] = await history.list();
    // Recorded, so "why was I never told?" is still answerable...
    expect(record.delivery.suppressed).toBe("preference-off");
    expect(record.resolvedAt).toBeUndefined();
    // ...but it never reaches the badge the user is meant to act on.
    expect(await history.activeCount(undefined, APP_BADGE_FILTERS)).toBe(0);
    expect(await history.list(APP_BADGE_FILTERS)).toEqual([]);
    expect((await history.suppressedActiveCounts())["preference-off"]).toBe(1);
    notifications.stop();
  });

  it("still badges a kind that is merely unconfigured rather than switched off", async () => {
    // "I never set up ntfy" is not the same statement as "do not tell me about
    // this", and only the second may suppress.
    const { bus, history, notifications } = service(ntfyPreferences());

    bus.emit("event", idleEvent("/tmp/loud", "ses_loud"));
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    expect((await history.list())[0].delivery.suppressed).toBeUndefined();
    expect(await history.activeCount(undefined, APP_BADGE_FILTERS)).toBe(1);
    notifications.stop();
  });

  it("checks lineage once per event instead of once per upstream echo", async () => {
    // The dedupe used to run after the session lookup, so echoes each burned
    // one of only four concurrency slots — starving the sub-agent gate during
    // exactly the bursts it exists for.
    const lookup = vi.fn(async () => null);
    const { bus, history, notifications } = service(ntfyPreferences(), lookup);

    bus.emit("event", idleEvent("/tmp/echo", "ses_echo"));
    bus.emit("event", idleEvent("/tmp/echo", "ses_echo"));
    bus.emit("event", idleEvent("/tmp/echo", "ses_echo"));
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    expect(lookup).toHaveBeenCalledTimes(1);
    notifications.stop();
  });

  it("tells the browser what was recorded, including that it was suppressed", async () => {
    // The browser used to classify raw upstream events itself, with no view of
    // session lineage, so a delegated child rang a bell the inbox denied.
    const lookup = vi.fn(async () => ({ id: "ses_child", parentID: "ses_parent", title: "Child work" }));
    const { bus, history, notifications } = service(ntfyPreferences(), lookup as never);
    const recorded: Array<Record<string, unknown>> = [];
    bus.on("event", (event: { type: string; properties: Record<string, unknown> }) => {
      if (event.type === "notification.recorded") recorded.push(event.properties);
    });

    bus.emit("event", idleEvent("/tmp/child", "ses_child"));
    await vi.waitFor(() => expect(recorded).toHaveLength(1));

    expect(recorded[0].kind).toBe("idle");
    expect(recorded[0].suppressed).toBe("subagent");
    expect((await history.list())[0].delivery.suppressed).toBe("subagent");
    notifications.stop();
  });

  it("cancels a parked escalation whichever key upstream used for the request id", async () => {
    // The cancel path read only properties.requestID while the record path
    // accepted requestID ?? id, so an `id`-shaped reply left the escalation
    // armed for a permission the user had already answered.
    const { bus, history, notifications } = service(ntfyPreferences());
    const asked = {
      type: "permission.asked",
      properties: { id: "perm_key", sessionID: "ses_key", permission: "bash", patterns: ["npm test"] },
      directory: "/tmp/key",
    };

    bus.emit("event", asked);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    bus.emit("event", { type: "permission.replied", properties: { id: "perm_key" }, directory: "/tmp/key" });

    // The timer is gone, so no second record can appear for this permission.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await history.list()).toHaveLength(1);
    notifications.stop();
  });
});

describe("agent output excerpts", () => {
  const idleEvent = { type: "session.idle", properties: { sessionID: "ses_work" }, directory: "/tmp/work" };

  function service(excerpt: (d: string, s: string, sig: AbortSignal) => Promise<string | undefined>) {
    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    const notifications = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      ntfyPreferences(),
      history,
      null,
      undefined,
      rootSession,
      undefined,
      excerpt,
    );
    notifications.start();
    return { bus, history, notifications };
  }

  it("records what the agent said so two idle rows from one session differ", async () => {
    // Three "Finished its turn and is waiting for you" rows under one session
    // header say nothing about which is which. This is that line.
    const { bus, history, notifications } = service(async () => "Rebuilt the bundle and fixed two type errors.");

    bus.emit("event", idleEvent);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    expect((await history.list())[0].detail).toBe("Rebuilt the bundle and fixed two type errors.");
    notifications.stop();
  });

  it("keeps the excerpt out of the outbound body", async () => {
    // The lock screen and a third-party relay stay content-free; only the
    // authenticated in-app row carries agent prose.
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) sent.push(init.body);
      return new Response("ok", { status: 200 });
    }));
    const secret = "Wrote the deploy key to /tmp/private/id_rsa";
    const { bus, history, notifications } = service(async () => secret);

    bus.emit("event", idleEvent);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    expect((await history.list())[0].detail).toBe(secret);
    for (const body of sent) expect(body).not.toContain("id_rsa");
    notifications.stop();
  });

  it("omits the excerpt rather than delaying or failing the notification", async () => {
    // Fail open: a missing excerpt costs the row some specificity, a stalled
    // lookup would cost the user the ping entirely.
    const { bus, history, notifications } = service(async () => {
      throw new Error("upstream down");
    });

    bus.emit("event", idleEvent);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    const [record] = await history.list();
    expect(record.detail).toBeUndefined();
    expect(record.displayBody).toBe("Finished its turn and is waiting for you");
    notifications.stop();
  });

  it("bounds a runaway excerpt before it reaches the durable log", async () => {
    const { bus, history, notifications } = service(async () => "x".repeat(5_000));

    bus.emit("event", idleEvent);
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    const detail = (await history.list())[0].detail ?? "";
    expect(detail.length).toBeLessThanOrEqual(240);
    expect(detail.endsWith("\u2026")).toBe(true);
    notifications.stop();
  });

  it("does not spend an upstream read on a permission, which already names its tool", async () => {
    const excerpt = vi.fn(async () => "unused");
    const { bus, history, notifications } = service(excerpt);

    bus.emit("event", {
      type: "permission.asked",
      properties: { id: "perm_x", sessionID: "ses_work", permission: "bash", patterns: ["npm test"] },
      directory: "/tmp/work",
    });
    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));

    expect(excerpt).not.toHaveBeenCalled();
    notifications.stop();
  });
});

describe("notification noise filters", () => {
  const delivered = { ntfy: "sent", desktop: "allowed" } as const;

  async function mixedHistory() {
    const history = historyStore();
    await history.append({ kind: "idle", directory: "/tmp/a", title: "root idle", body: "", delivery: delivered });
    await history.append({
      kind: "permission",
      directory: "/tmp/a",
      title: "auto",
      body: "",
      delivery: { ntfy: "off", desktop: "off", suppressed: "auto-permissions" },
    });
    await history.append({
      kind: "idle",
      directory: "/tmp/a",
      title: "child",
      body: "",
      delivery: { ntfy: "off", desktop: "off", suppressed: "subagent" },
    });
    await history.append({ kind: "idle", directory: "/tmp/b", title: "other project", body: "", delivery: delivered });
    return history;
  }

  it("applies each filter independently to the rows and the count together", async () => {
    const history = await mixedHistory();

    expect(await history.activeCount("/tmp/a")).toBe(3);
    expect(await history.activeCount("/tmp/a", { hideAutoApproved: true })).toBe(2);
    expect(await history.activeCount("/tmp/a", { hideSubagent: true })).toBe(2);
    expect(await history.activeCount("/tmp/a", { hideAutoApproved: true, hideSubagent: true })).toBe(1);

    const visible = await history.list({ hideAutoApproved: true, hideSubagent: true });
    expect(visible.map((record) => record.title)).toEqual(["other project", "root idle"]);
  });

  it("reports what each filter hides so a checkbox can state its own cost", async () => {
    const history = await mixedHistory();

    expect(await history.suppressedActiveCounts("/tmp/a")).toEqual({ "auto-permissions": 1, subagent: 1, "preference-off": 0 });
    expect(await history.suppressedActiveCounts("/tmp/b")).toEqual({ "auto-permissions": 0, subagent: 0, "preference-off": 0 });

    // Resolving a suppressed record stops it counting against its filter.
    const auto = (await history.list()).find((record) => record.title === "auto")!;
    await history.setResolved(auto.id, true);
    expect(await history.suppressedActiveCounts("/tmp/a")).toEqual({ "auto-permissions": 0, subagent: 1, "preference-off": 0 });
  });

  it("counts delivered unresolved records globally for the installed-app badge", async () => {
    const history = await mixedHistory();
    const initial = await history.appBadgeSnapshot();
    expect(await history.appBadgeCount()).toBe(2);
    const root = (await history.list()).find((record) => record.title === "root idle")!;
    await history.setResolved(root.id, true);
    expect(await history.appBadgeCount()).toBe(1);
    const resolved = await history.appBadgeSnapshot();
    expect(resolved.revision).toBeGreaterThan(initial.revision);
    await history.setResolved(root.id, false);
    expect(await history.appBadgeCount()).toBe(2);
    expect((await history.appBadgeSnapshot()).revision).toBeGreaterThan(resolved.revision);
  });

  it("defaults to the unfiltered log so an existing caller loses nothing", async () => {
    const history = await mixedHistory();
    expect(await history.list()).toHaveLength(4);
    expect(await history.activeCount()).toBe(4);
  });

  it("caps unresolved suppressed records while retaining delivered ones", async () => {
    const history = historyStore(2);
    for (let index = 0; index < 4; index += 1) {
      await history.append({
        kind: "idle",
        directory: "/tmp/a",
        title: `child ${index}`,
        body: "",
        delivery: { ntfy: "off", desktop: "off", suppressed: "subagent" },
      });
    }
    for (let index = 0; index < 4; index += 1) {
      await history.append({ kind: "idle", directory: "/tmp/a", title: `root ${index}`, body: "", delivery: delivered });
    }

    // Suppressed rows are a bounded audit trail, not a checklist: nothing was
    // ever delivered for them, so they must not grow the log without limit.
    // Delivered unresolved rows keep the original never-drop guarantee.
    const titles = (await history.list()).map((record) => record.title);
    expect(titles.filter((title) => title.startsWith("child"))).toEqual(["child 3", "child 2"]);
    expect(titles.filter((title) => title.startsWith("root"))).toHaveLength(4);
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

  it("serves a page wide enough to group a full retained log", async () => {
    // Grouping counts the rows it renders, so a page that stops at the old 200
    // would make every group header understate a busy session. Unresolved
    // delivered records are never pruned, so the log itself can exceed the
    // 500-per-category retention cap.
    const history = historyStore();
    const delivery = { ntfy: "off", desktop: "allowed" } as const;
    for (let index = 0; index < 260; index += 1) {
      await history.append({ kind: "idle", title: `idle ${index}`, body: "", delivery });
    }

    expect(await history.list({ limit: 1000 })).toHaveLength(260);
    // The clamp is still a clamp; it just sits high enough to be irrelevant.
    expect(await history.list({ limit: 50 })).toHaveLength(50);
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
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" }, bus, ntfyPreferences(), history, null, undefined, rootSession,
    );
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
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" }, bus, ntfyPreferences(), history, null, undefined, rootSession,
    );
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

  it("revalidates lineage before delivering a parked permission", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const bus = new EventEmitter() as EventBus;
    const history = historyStore();
    let lookupCount = 0;
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      {
        read: async () => normalizePreferences({
          ntfy: { enabled: true, server: "https://ntfy.sh", topic: "team" },
          parkedPermissionSeconds: 5,
        }),
      } as PreferenceStore,
      history,
      null,
      undefined,
      async (_directory, sessionID) => {
        lookupCount += 1;
        return lookupCount === 1 ? null : { id: sessionID, parentID: "ses_parent" };
      },
    );
    service.start();
    const recorded = new Promise<void>((resolve) => {
      const onRecorded = (event: { type?: string }) => {
        if (event.type !== "notification.recorded") return;
        bus.off("event", onRecorded);
        resolve();
      };
      bus.on("event", onRecorded);
    });
    bus.emit("event", asked);
    await recorded;

    await vi.advanceTimersByTimeAsync(5_001);
    expect((await history.list()).map((item) => item.kind)).toEqual(["permission"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(lookupCount).toBe(2);
    service.stop();
  });
});
