import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import os from "node:os";
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
  it("is volatile without a state file, disabled by default, and scoped by directory", async () => {
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

  it("restores persisted flags across a restart and reconciles pending asks", async () => {
    // The flag used to be memory-only, so every deploy silently flipped an
    // auto-approved directory back to ask mode — and the next agent turn fired
    // one permission push per tool call until the user noticed.
    const pending = permission("perm_boot");
    const replies: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/reply")) {
        replies.push(url);
        return Response.json(true);
      }
      return init?.method === "POST" ? Response.json(true) : Response.json([pending]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-state-")), "auto-approve.json");

    const bus = new EventEmitter() as EventBus;
    const first = new AutoPermissionService(config, bus, file);
    first.start();
    await first.setEnabled(directory, true);
    first.stop();

    const second = new AutoPermissionService(config, new EventEmitter() as EventBus, file);
    second.start();
    // The restored flag also answers asks that arrived while the BFF was down.
    await vi.waitFor(() => expect(second.isEnabled(directory)).toBe(true));
    await vi.waitFor(() => expect(replies.some((url) => url.includes("perm_boot"))).toBe(true));
    second.stop();

    // An explicit disable is persisted too: the next restart stays off.
    await second.setEnabled(directory, false);
    const third = new AutoPermissionService(config, new EventEmitter() as EventBus, file);
    third.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(third.isEnabled(directory)).toBe(false);
    third.stop();
  });

  it("fails closed on a corrupt state file and an explicit toggle wins over the load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-corrupt-"));
    const corrupt = path.join(root, "auto-approve.json");
    const { writeFile, readFile } = await import("node:fs/promises");
    await writeFile(corrupt, "not json");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const instance = new AutoPermissionService(config, new EventEmitter() as EventBus, corrupt);
    instance.start();
    // setEnabled awaits the load, so this is also the explicit-toggle-wins path.
    await instance.setEnabled(directory, true);
    expect(instance.isEnabled(directory)).toBe(true);
    expect(JSON.parse(await readFile(corrupt, "utf8"))).toEqual({ version: 1, enabled: [directory] });
    instance.stop();
    warning.mockRestore();
  });

  it("resolves aliases before checking enabled state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-alias-"));
    const project = path.join(root, "project");
    const alias = path.join(root, "alias");
    await mkdir(project);
    await symlink(project, alias);
    process.env.PROJECTS_DIR = root;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const { instance } = service();

    await instance.setEnabled(await realpath(project), true);

    expect(instance.isEnabled(alias)).toBe(false);
    await expect(instance.isEnabledCanonical(alias)).resolves.toBe(true);
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
