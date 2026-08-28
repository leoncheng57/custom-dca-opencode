import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";

import { MAX_PUSH_SUBSCRIPTIONS, PushSubscriptionStore, sendWebPush, webPushConfig } from "../server/notifications/webpush.js";
import { NotificationService } from "../server/notifications/service.js";
import { normalizePreferences, type PreferenceStore } from "../server/notifications/preferences.js";
import { HistoryStore } from "../server/notifications/history.js";
import type { EventBus } from "../server/opencode/events.js";
import { AutoPermissionService } from "../server/opencode/autoPermissions.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Web Push configuration", () => {
  it("is optional but requires a complete VAPID configuration", () => {
    const vapid = webpush.generateVAPIDKeys();
    expect(webPushConfig({})).toBeNull();
    expect(() => webPushConfig({ VAPID_PUBLIC_KEY: "public" })).toThrow(/configured together/u);
    expect(() => webPushConfig({ VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "owner" })).toThrow(/configured together/u);
    expect(() => webPushConfig({ VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:owner@example.com" })).toThrow();
    expect(webPushConfig({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: "mailto:owner@example.com" }))
      .toEqual({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "mailto:owner@example.com" });
  });
});

describe("Web Push subscriptions", () => {
  it("persists, replaces, removes, and rejects malformed subscriptions", async () => {
    const file = path.join(os.tmpdir(), `dca-web-push-${process.pid}-${Date.now()}.json`);
    const store = new PushSubscriptionStore(file);
    const first = { endpoint: "https://fcm.googleapis.com/device", keys: { p256dh: "one", auth: "auth" } };
    await store.add(first);
    await store.add({ ...first, keys: { p256dh: "two", auth: "new-auth" } });
    expect(await store.list()).toEqual([{ ...first, keys: { p256dh: "two", auth: "new-auth" } }]);
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ version: 1, subscriptions: [{ endpoint: first.endpoint }] });
    await expect(store.add({ endpoint: "https://evil.example.test/device", keys: first.keys })).rejects.toThrow(/invalid/u);
    await store.remove(first.endpoint);
    expect(await store.list()).toEqual([]);
  });

  it("does not remove refreshed keys when an older delivery expires", async () => {
    const store = new PushSubscriptionStore(path.join(os.tmpdir(), `dca-web-push-refresh-${process.pid}-${Date.now()}.json`));
    const endpoint = "https://fcm.googleapis.com/refreshed";
    const oldKeys = { p256dh: "old", auth: "old-auth" };
    const newKeys = { p256dh: "new", auth: "new-auth" };
    await store.add({ endpoint, keys: oldKeys });
    await store.add({ endpoint, keys: newKeys });
    await store.remove(endpoint, oldKeys);
    expect(await store.list()).toEqual([{ endpoint, keys: newKeys }]);
  });

  it("rejects corrupt state and caps registered devices", async () => {
    const file = path.join(os.tmpdir(), `dca-web-push-bounds-${process.pid}-${Date.now()}.json`);
    const store = new PushSubscriptionStore(file);
    await writeFile(file, "not json");
    await expect(store.list()).rejects.toThrow();
    await expect(store.add({ endpoint: "https://fcm.googleapis.com/device", keys: { p256dh: "key", auth: "auth" } })).rejects.toThrow();

    const bounded = new PushSubscriptionStore(`${file}.bounded`);
    for (let index = 0; index < MAX_PUSH_SUBSCRIPTIONS; index += 1) {
      await bounded.add({ endpoint: `https://fcm.googleapis.com/device-${index}`, keys: { p256dh: `key-${index}`, auth: "auth" } });
    }
    await expect(bounded.add({ endpoint: "https://fcm.googleapis.com/overflow", keys: { p256dh: "key", auth: "auth" } }))
      .rejects.toThrow(String(MAX_PUSH_SUBSCRIPTIONS));
    expect(await bounded.list()).toHaveLength(MAX_PUSH_SUBSCRIPTIONS);
  });
});

describe("Web Push delivery", () => {
  it("fails honestly when VAPID is not configured", async () => {
    await expect(sendWebPush(
      [{ endpoint: "https://fcm.googleapis.com/device", keys: { p256dh: "key", auth: "auth" } }],
      { event: "idle", title: "Done", body: "Waiting" },
      null,
    )).rejects.toThrow("Web Push is not configured");
  });

  it("identifies expired provider subscriptions for removal", async () => {
    const vapid = webpush.generateVAPIDKeys();
    vi.spyOn(webpush, "sendNotification").mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    const result = await sendWebPush(
      [{ endpoint: "https://fcm.googleapis.com/expired", keys: { p256dh: "key", auth: "auth" } }],
      { event: "idle", title: "Done", body: "Waiting" },
      { ...vapid, subject: "mailto:owner@example.com", privateKey: vapid.privateKey, publicKey: vapid.publicKey },
    );
    expect(result).toEqual({ sent: 0, failed: 1, expired: ["https://fcm.googleapis.com/expired"] });
    expect(webpush.sendNotification).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({ timeout: 10_000 }));
  });

  it("delivers independently from ntfy and records the result", async () => {
    const vapid = webpush.generateVAPIDKeys();
    vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:owner@example.com");
    const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    const subscriptions = new PushSubscriptionStore(path.join(os.tmpdir(), `dca-web-push-delivery-${process.pid}-${Date.now()}.json`));
    await subscriptions.add({ endpoint: "https://fcm.googleapis.com/device", keys: { p256dh: "key", auth: "auth" } });
    const history = new HistoryStore(path.join(os.tmpdir(), `dca-web-push-history-${process.pid}-${Date.now()}.json`));
    await history.append({
      kind: "idle",
      directory: "/tmp/other-project",
      title: "Other project",
      body: "",
      delivery: { ntfy: "off", desktop: "off", webPush: "sent" },
    });
    await history.append({
      kind: "idle",
      directory: "/tmp/hidden-child",
      title: "Suppressed child",
      body: "",
      delivery: { ntfy: "off", desktop: "off", webPush: "off", suppressed: "subagent" },
    });
    const preferences = {
      read: async () => normalizePreferences({
        ntfy: { enabled: false, server: "https://ntfy.sh", topic: "" },
        webPush: { enabled: true },
      }),
    } as PreferenceStore;
    const bus = new EventEmitter() as EventBus;
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      preferences,
      history,
      null,
      undefined,
      async (_directory, sessionID) => ({ id: sessionID }),
      subscriptions,
    );
    service.start();
    bus.emit("event", { type: "session.idle", directory: "/tmp/project", properties: { sessionID: "ses_push" } });

    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const payload = JSON.parse(String(send.mock.calls[0][1])) as { badgeCount: number; badgeRevision: number; tag: string };
    expect(payload.badgeCount).toBe(2);
    expect(payload.badgeRevision).toBeGreaterThan(0);
    // Session-scoped, so the service worker replaces this session's previous
    // card instead of piling a new one into the OS notification center.
    expect(payload.tag).toBe("ses_push");
    await vi.waitFor(async () => expect((await history.list()).find((record) => record.sessionID === "ses_push")?.delivery)
      .toMatchObject({ ntfy: "off", webPush: "sent" }));
    service.stop();
  });

  it("does not deliver auto-approved permissions received through a directory alias", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-web-push-auto-permission-"));
    const directory = path.join(root, "project");
    const alias = path.join(root, "alias");
    await mkdir(directory);
    await symlink(directory, alias);
    vi.stubEnv("PROJECTS_DIR", root);
    const vapid = webpush.generateVAPIDKeys();
    vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:owner@example.com");
    const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/permission" && init?.method === "GET") return Response.json([]);
      if (url.pathname === "/permission/perm_alias/reply") return Response.json(true);
      return new Response("unexpected delivery", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const subscriptions = new PushSubscriptionStore(path.join(root, "subscriptions.json"));
    await subscriptions.add({ endpoint: "https://fcm.googleapis.com/device", keys: { p256dh: "key", auth: "auth" } });
    const preferences = {
      read: async () => normalizePreferences({
        ntfy: { enabled: true, server: "https://ntfy.sh", topic: "team" },
        browser: { desktop: true },
        webPush: { enabled: true },
      }),
    } as PreferenceStore;
    const bus = new EventEmitter() as EventBus;
    const autoPermissions = new AutoPermissionService({ baseUrl: "http://opencode.test" }, bus);
    autoPermissions.start();
    await autoPermissions.setEnabled(await realpath(directory), true);
    fetchMock.mockClear();
    const history = new HistoryStore(path.join(root, "history.json"));
    const service = new NotificationService(
      { baseUrl: "http://opencode.test" },
      bus,
      preferences,
      history,
      null,
      (eventDirectory) => autoPermissions.isEnabledCanonical(eventDirectory),
      async (_eventDirectory, sessionID) => ({ id: sessionID }),
      subscriptions,
    );
    service.start();
    const recorded: Array<Record<string, unknown>> = [];
    bus.on("event", (event: { type: string; properties: Record<string, unknown> }) => {
      if (event.type === "notification.recorded") recorded.push(event.properties);
    });

    bus.emit("event", {
      type: "permission.asked",
      directory: alias,
      properties: {
        id: "perm_alias",
        sessionID: "ses_alias",
        permission: "bash",
        patterns: ["npm test"],
        metadata: {},
        always: [],
      },
    });

    await vi.waitFor(async () => expect(await history.list()).toHaveLength(1));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/permission/perm_alias/reply");
    expect(push).not.toHaveBeenCalled();
    expect((await history.list())[0].delivery).toEqual({
      ntfy: "off",
      desktop: "off",
      webPush: "off",
      suppressed: "auto-permissions",
    });
    expect(recorded).toMatchObject([{ kind: "permission", suppressed: "auto-permissions" }]);
    service.stop();
    autoPermissions.stop();
  });
});

describe("notification service worker", () => {
  it("handles push and clicks without intercepting requests or caching agent data", async () => {
    const source = await readFile(path.resolve("client/public/sw.js"), "utf8");
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("target.origin === self.location.origin");
    expect(source).toContain("setAppBadge");
    expect(source).toContain("clearAppBadge");
    expect(source).toContain("SYNC_BADGE");
    expect(source).toContain("storedBadgeState");
    expect(source).not.toContain('addEventListener("fetch"');
    expect(source).not.toMatch(/caches\.|CacheStorage/u);
  });

  it("does not need message-passing for closing stale notifications", async () => {
    // Stale notification cleanup (issue #270) uses the page-side
    // ServiceWorkerRegistration.getNotifications() API directly, which works
    // identically whether called from page or worker context. No service
    // worker message handler needed — simpler and more direct.
    const source = await readFile(path.resolve("client/public/sw.js"), "utf8");
    expect(source).not.toContain("CLOSE_SESSION_NOTIFICATIONS");
    expect(source).not.toContain("CLOSE_STALE");
  });
});
