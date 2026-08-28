import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoPermissionService } from "../server/opencode/autoPermissions.js";
import type { EventBus } from "../server/opencode/events.js";
import { parsePermissionRequest } from "../server/opencode/permissions.js";

const directory = process.cwd();
const config = { baseUrl: "http://opencode.test" };
const previousProjectsDirectory = process.env.PROJECTS_DIR;
// Production reconciles the shared state file every 5s (throttled to at most
// once per 1s on-demand); tests override both to milliseconds so a state-file
// change made outside the instance under test is observed quickly without
// fake timers, which would also have to fake the real fs.promises I/O below.
const FAST_RELOAD_MS = 20;

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

  // The state file used to be read once at boot and never again, so a
  // directory enabled after that — by a manual edit, or by a second process
  // sharing the default state-file path — stayed silently stale for the life
  // of the process. This is exactly what happened in production: one
  // auto-approved directory kept suppressing correctly while a sibling
  // directory, enabled in the same file after boot, kept sending ordinary
  // Web Push permission alerts.
  it("reconciles a directory enabled by writing the state file directly after the service has started", async () => {
    const pending = permission("perm_external");
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/permission" && init?.method === "GET") return Response.json([pending]);
      if (url.pathname === "/permission/perm_external/reply") return Response.json(true);
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-external-")), "auto-approve.json");
    const bus = new EventEmitter() as EventBus;
    const instance = new AutoPermissionService(config, bus, file, FAST_RELOAD_MS, FAST_RELOAD_MS);
    instance.start();

    // Simulate a second writer — another process, or a manual edit — enabling
    // this directory after the service already started against an empty (or
    // nonexistent) file.
    await writeFile(file, `${JSON.stringify({ version: 1, enabled: [directory] }, null, 2)}\n`, { mode: 0o600 });

    await vi.waitFor(() => expect(instance.isEnabled(directory)).toBe(true));
    expect(instance.snapshot().source[directory]).toBe("loaded");
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/permission/perm_external/reply"))).toBe(true));
    instance.stop();
  });

  it("keeps two instances sharing one state file in agreement, including demotion", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-shared-")), "auto-approve.json");
    const instanceA = new AutoPermissionService(config, new EventEmitter() as EventBus, file, FAST_RELOAD_MS, FAST_RELOAD_MS);
    const instanceB = new AutoPermissionService(config, new EventEmitter() as EventBus, file, FAST_RELOAD_MS, FAST_RELOAD_MS);
    instanceA.start();
    instanceB.start();

    await instanceA.setEnabled(directory, true);
    await vi.waitFor(() => expect(instanceB.isEnabled(directory)).toBe(true));
    // Instance B only ever reconciled the file — it never received an
    // explicit toggle itself — so its provenance for this directory is
    // "loaded", distinct from instance A's own "explicit" entry.
    expect(instanceB.snapshot().source[directory]).toBe("loaded");

    await instanceA.setEnabled(directory, false);
    await vi.waitFor(() => expect(instanceB.isEnabled(directory)).toBe(false));

    instanceA.stop();
    instanceB.stop();
  });

  it("keeps an explicit toggle even after an external rewrite omits that directory entirely", async () => {
    const other = `${directory}-other`;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-explicit-wins-")), "auto-approve.json");
    const bus = new EventEmitter() as EventBus;
    const instance = new AutoPermissionService(config, bus, file, FAST_RELOAD_MS, FAST_RELOAD_MS);
    instance.start();

    await instance.setEnabled(directory, true);
    expect(instance.snapshot().source[directory]).toBe("explicit");

    // A second writer rewrites the file to enable a different directory,
    // without ever mentioning `directory` at all.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(file, `${JSON.stringify({ version: 1, enabled: [other] }, null, 2)}\n`, { mode: 0o600 });

    await vi.waitFor(() => expect(instance.isEnabled(other)).toBe(true));
    // An explicit toggle must survive an external rewrite that doesn't even
    // mention it — the file is not required to echo back every explicitly
    // toggled directory for that directory to stay enabled in this process.
    expect(instance.isEnabled(directory)).toBe(true);
    expect(instance.snapshot().source[directory]).toBe("explicit");

    instance.stop();
  });

  // Uses the explicit `reload()` hook rather than the background timer so the
  // assertion on call *count* is deterministic instead of racing a wall-clock
  // interval — a real interval-driven reconcile pass can occasionally land
  // twice in very close succession under system load, which would make an
  // exact-count assertion flaky without actually indicating a logic bug.
  it("warns about an external state-file change exactly once per change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-warn-"));
    const file = path.join(root, "auto-approve.json");
    await writeFile(file, `${JSON.stringify({ version: 1, enabled: [] }, null, 2)}\n`, { mode: 0o600 });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bus = new EventEmitter() as EventBus;
    const instance = new AutoPermissionService(config, bus, file);
    instance.start();
    await instance.reload();
    // The very first sighting of a file is never treated as "external" (it
    // may just be this process's own first boot), so only what follows below
    // is expected to warn.
    warning.mockClear();

    await new Promise((resolve) => setTimeout(resolve, 5)); // guarantee a distinct mtime
    await writeFile(file, `${JSON.stringify({ version: 1, enabled: [directory] }, null, 2)}\n`, { mode: 0o600 });
    await instance.reload();
    expect(instance.isEnabled(directory)).toBe(true);
    // Reconciling again against unchanged content must not warn again.
    await instance.reload();
    await instance.reload();

    expect(warning.mock.calls.filter(
      (call) => call[0] === "[auto-permission]" && call[1] === "state file changed outside this process; reconciling",
    )).toHaveLength(1);

    instance.stop();
    warning.mockRestore();
  });

  it("does not warn about its own persisted write", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), "dca-auto-permission-own-write-")), "auto-approve.json");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bus = new EventEmitter() as EventBus;
    const instance = new AutoPermissionService(config, bus, file);
    instance.start();

    await instance.setEnabled(directory, true);
    // Simulate the next scheduled reconcile pass observing this process's
    // own already-recorded write.
    await instance.reload();
    await instance.reload();

    expect(warning.mock.calls.some(
      (call) => call[1] === "state file changed outside this process; reconciling",
    )).toBe(false);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ version: 1, enabled: [directory] });

    instance.stop();
    warning.mockRestore();
  });
});
