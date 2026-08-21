import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoPermissionService } from "../server/opencode/autoPermissions.js";
import type { EventBus } from "../server/opencode/events.js";
import { parsePermissionRequest } from "../server/opencode/permissions.js";

const directory = process.cwd();
const config = { baseUrl: "http://opencode.test" };
const previousProjectsDirectory = process.env.PROJECTS_DIR;

function permission(id = "perm_test") {
  return {
    id,
    sessionID: "ses_test",
    permission: "bash",
    patterns: ["npm test"],
    metadata: { command: "npm test" },
    always: ["npm *"],
    tool: { messageID: "msg_test", callID: "call_test" },
  };
}

function service() {
  const bus = new EventEmitter() as EventBus;
  const instance = new AutoPermissionService(config, bus);
  instance.start();
  return { bus, instance };
}

beforeEach(() => {
  process.env.PROJECTS_DIR = path.dirname(directory);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousProjectsDirectory === undefined) delete process.env.PROJECTS_DIR;
  else process.env.PROJECTS_DIR = previousProjectsDirectory;
});

describe("permission request parsing", () => {
  it("preserves the complete upstream shape and tolerates older fixtures", () => {
    expect(parsePermissionRequest(permission())).toEqual(permission());
    expect(parsePermissionRequest({ id: "perm_old", sessionID: "ses_old", permission: "read", patterns: [] }))
      .toEqual({
        id: "perm_old",
        sessionID: "ses_old",
        permission: "read",
        patterns: [],
        metadata: {},
        always: [],
      });
    expect(parsePermissionRequest({ sessionID: "ses_missing_id" })).toBeNull();
  });
});

describe("AutoPermissionService", () => {
  it("is volatile, disabled by default, and scoped by directory", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const first = service().instance;
    expect(first.status(directory)).toEqual({ enabled: false, error: null });
    await first.setEnabled(directory, true);
    expect(first.isEnabled(directory)).toBe(true);
    expect(first.isEnabled(`${directory}/other`)).toBe(false);
    await first.setEnabled(directory, false);
    expect(first.status(directory)).toEqual({ enabled: false, error: null });
    expect(service().instance.status(directory).enabled).toBe(false);
  });

  it("reconciles existing requests with once and never uses always", async () => {
    const pending = permission("perm_existing");
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/permission" && init?.method === "GET") return Response.json([pending]);
      if (url.pathname === "/permission/perm_existing/reply") return Response.json(true);
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { instance } = service();
    expect(await instance.setEnabled(directory, true)).toEqual({ enabled: true, error: null });
    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).includes("/reply"))!;
    expect(JSON.parse(String(init?.body))).toEqual({ reply: "once" });
    expect(String(fetchMock.mock.calls[0][0])).toContain(`directory=${encodeURIComponent(directory)}`);
  });

  it("handles enabled asked events once while leaving questions and disabled directories alone", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/permission" && init?.method === "GET") return Response.json([]);
      if (url.pathname.endsWith("/reply")) return Response.json(true);
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { bus, instance } = service();
    await instance.setEnabled(directory, true);
    fetchMock.mockClear();

    const asked = { type: "permission.asked", directory, properties: permission("perm_event") };
    bus.emit("event", asked);
    bus.emit("event", asked);
    bus.emit("event", { type: "question.asked", directory, properties: { id: "que_test" } });
    bus.emit("event", { type: "permission.asked", properties: permission("perm_unscoped") });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain("/permission/perm_event/reply");

    await instance.setEnabled(directory, false);
    bus.emit("event", { ...asked, properties: permission("perm_disabled") });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets disable cancel queued event work and retains auto-reply failures", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/permission" && init?.method === "GET") return Response.json([]);
      return new Response("reply failed", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { bus, instance } = service();
    await instance.setEnabled(directory, true);
    fetchMock.mockClear();

    bus.emit("event", { type: "permission.asked", directory, properties: permission("perm_cancelled") });
    await instance.setEnabled(directory, false);
    expect(fetchMock).not.toHaveBeenCalled();

    await instance.setEnabled(directory, true);
    fetchMock.mockClear();
    bus.emit("event", { type: "permission.asked", directory, properties: permission("perm_fail") });
    await vi.waitFor(() => expect(instance.status(directory).error).toContain("Could not auto-approve bash"));
    expect(instance.status(directory).enabled).toBe(true);
  });

  it("clears a durable failure when the request is manually resolved", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/permission" && init?.method === "GET") return Response.json([]);
      return new Response("reply failed", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { bus, instance } = service();
    await instance.setEnabled(directory, true);

    bus.emit("event", { type: "permission.asked", directory, properties: permission("perm_manual") });
    await vi.waitFor(() => expect(instance.status(directory).error).toContain("Could not auto-approve bash"));
    bus.emit("event", {
      type: "permission.replied",
      directory,
      properties: { requestID: "perm_manual", sessionID: "ses_test", reply: "reject" },
    });
    await vi.waitFor(() => expect(instance.status(directory).error).toBeNull());
  });
});
