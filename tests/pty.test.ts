import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isPtyControlFrame, ptySocketTarget } from "../server/opencode/pty.js";
import { PathError, requireWorkspaceSubdirectory } from "../server/paths.js";
import { authorizePtyAttach, HandshakeError, PTY_ATTACH_PATH } from "../server/routes/ptySocket.js";
import { ptyOriginAllowlist } from "../server/ptyPolicy.js";
import { PtyAuditService } from "../server/notifications/ptyAudit.js";
import { HistoryStore } from "../server/notifications/history.js";
import { PreferenceStore } from "../server/notifications/preferences.js";
import { EventBus } from "../server/opencode/events.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("working-directory confinement", () => {
  let project: string;
  let outside: string;

  beforeEach(async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "dca-pty-")));
    project = path.join(root, "project");
    outside = path.join(root, "outside");
    await mkdir(path.join(project, "packages", "api"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(project, "README.md"), "# hi\n");
  });

  it("defaults to the project root when no cwd is given", async () => {
    await expect(requireWorkspaceSubdirectory(project, undefined)).resolves.toBe(project);
    await expect(requireWorkspaceSubdirectory(project, "")).resolves.toBe(project);
  });

  it("resolves a nested directory and returns the canonical path", async () => {
    await expect(requireWorkspaceSubdirectory(project, "packages/api")).resolves.toBe(
      path.join(project, "packages", "api"),
    );
  });

  it("rejects traversal out of the project", async () => {
    // Upstream accepts any absolute cwd — verified live, POST /pty with
    // cwd:/etc succeeds — so this is the only thing keeping a shell inside
    // PROJECTS_DIR.
    await expect(requireWorkspaceSubdirectory(project, "../outside")).rejects.toBeInstanceOf(PathError);
  });

  it("rejects an absolute cwd", async () => {
    await expect(requireWorkspaceSubdirectory(project, "/etc")).rejects.toBeInstanceOf(PathError);
  });

  it("rejects a symlink that escapes the project", async () => {
    await symlink(outside, path.join(project, "escape"), "dir");
    await expect(requireWorkspaceSubdirectory(project, "escape")).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a file", async () => {
    await expect(requireWorkspaceSubdirectory(project, "README.md")).rejects.toMatchObject({ status: 400 });
  });

  it("reports a missing directory as not found", async () => {
    await expect(requireWorkspaceSubdirectory(project, "nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("upstream socket target", () => {
  it("switches http to ws and carries the directory scope", () => {
    const target = ptySocketTarget({ baseUrl: "http://opencode.test:4096" }, "/tmp/project", "pty_1");
    const url = new URL(target.url);
    expect(url.protocol).toBe("ws:");
    expect(url.pathname).toBe("/pty/pty_1/connect");
    expect(url.searchParams.get("directory")).toBe("/tmp/project");
  });

  it("switches https to wss", () => {
    const target = ptySocketTarget({ baseUrl: "https://opencode.test" }, "/tmp/project", "pty_1");
    expect(new URL(target.url).protocol).toBe("wss:");
  });

  it("carries basic auth on the upgrade instead of minting a connect ticket", () => {
    // connect-token answers 403 in opencode 1.18.21 even with valid auth. The
    // BFF is a Node client and can send the header a browser cannot, so no
    // credential-equivalent is ever created — let alone handed to the browser.
    const target = ptySocketTarget(
      { baseUrl: "http://opencode.test", username: "opencode", password: "s3cret" },
      "/tmp/project",
      "pty_1",
    );
    expect(target.headers.Authorization).toBe(`Basic ${Buffer.from("opencode:s3cret").toString("base64")}`);
    expect(target.url).not.toContain("ticket");
    expect(target.url).not.toContain("s3cret");
  });

  it("sends no credential when upstream is unsecured", () => {
    const target = ptySocketTarget({ baseUrl: "http://opencode.test" }, "/tmp/project", "pty_1");
    expect(target.headers).toEqual({});
  });
});

describe("upstream frame classification", () => {
  it("recognises the binary NUL-prefixed control frame", () => {
    // Observed live: \x00{"cursor":284}. xterm.js would render it as garbage.
    expect(isPtyControlFrame(Buffer.from('\u0000{"cursor":284}', "utf8"), true)).toBe(true);
  });

  it("treats terminal output as data", () => {
    expect(isPtyControlFrame(Buffer.from("total 0\r\n", "utf8"), false)).toBe(false);
    // A binary frame that does not start with NUL is not upstream's control
    // channel, so it is left alone rather than silently swallowed.
    expect(isPtyControlFrame(Buffer.from([0x41, 0x42]), true)).toBe(false);
    expect(isPtyControlFrame(Buffer.alloc(0), true)).toBe(false);
  });
});

describe("attach path matching", () => {
  it("matches only a well-formed pty id", () => {
    expect(PTY_ATTACH_PATH.exec("/api/pty/pty_abc123/attach")?.[1]).toBe("pty_abc123");
    expect(PTY_ATTACH_PATH.test("/api/pty/ses_abc/attach")).toBe(false);
    expect(PTY_ATTACH_PATH.test("/api/pty/pty_abc/attach/extra")).toBe(false);
    expect(PTY_ATTACH_PATH.test("/api/pty/pty_a%2F..%2Fx/attach")).toBe(false);
    expect(PTY_ATTACH_PATH.test("/api/events")).toBe(false);
  });
});

describe("WebSocket handshake authorization", () => {
  const config = { baseUrl: "http://opencode.test" };
  const allowedOrigins = ptyOriginAllowlist({ publicAppUrl: "https://ide.test", loopbackPorts: [3000] });
  let project: string;

  beforeEach(async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "dca-pty-ws-")));
    project = path.join(root, "project");
    await mkdir(project, { recursive: true });
    process.env.PROJECTS_DIR = root;
  });

  const attachUrl = (directory = project, id = "pty_1") =>
    `/api/pty/${id}/attach?directory=${encodeURIComponent(directory)}`;

  const stubUpstream = (status = 200) => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          status === 200
            ? JSON.stringify({ id: "pty_1", title: "t", command: "/bin/bash", args: [], cwd: project, status: "running", pid: 1 })
            : JSON.stringify({ _tag: "PtyNotFoundError" }),
          { status },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("accepts a permitted origin for a PTY that exists in the project", async () => {
    stubUpstream();
    await expect(
      authorizePtyAttach(config, { mode: "read-only", allowedOrigins }, { url: attachUrl(), origin: "https://ide.test" }),
    ).resolves.toMatchObject({ ptyID: "pty_1", directory: project });
  });

  it("refuses every attach when the feature is off", async () => {
    const fetchMock = stubUpstream();
    await expect(
      authorizePtyAttach(config, { mode: "off", allowedOrigins }, { url: attachUrl(), origin: "https://ide.test" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin BEFORE touching upstream", async () => {
    // Browsers do not apply CORS to WS handshakes and opencode itself accepts
    // Origin: http://evil.example (verified live), so this check is the only
    // thing standing between a visited web page and a shell on the host.
    const fetchMock = stubUpstream();
    await expect(
      authorizePtyAttach(
        config,
        { mode: "interactive", allowedOrigins },
        { url: attachUrl(), origin: "https://evil.example" },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a handshake with no Origin header", async () => {
    const fetchMock = stubUpstream();
    await expect(
      authorizePtyAttach(config, { mode: "interactive", allowedOrigins }, { url: attachUrl(), origin: undefined }),
    ).rejects.toBeInstanceOf(HandshakeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a directory outside PROJECTS_DIR", async () => {
    stubUpstream();
    await expect(
      authorizePtyAttach(
        config,
        { mode: "interactive", allowedOrigins },
        { url: attachUrl("/etc"), origin: "https://ide.test" },
      ),
    ).rejects.toMatchObject({ status: expect.any(Number) });
  });

  it("requires a directory at all", async () => {
    stubUpstream();
    await expect(
      authorizePtyAttach(
        config,
        { mode: "interactive", allowedOrigins },
        { url: "/api/pty/pty_1/attach", origin: "https://ide.test" },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("reports a PTY belonging to another project as not found", async () => {
    // Upstream 404s a PTY addressed through the wrong directory; passing that
    // through unchanged is what confines a PTY to its project.
    stubUpstream(404);
    await expect(
      authorizePtyAttach(
        config,
        { mode: "interactive", allowedOrigins },
        { url: attachUrl(), origin: "https://ide.test" },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("does not answer 404 for an unreachable agent server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(
      authorizePtyAttach(
        config,
        { mode: "interactive", allowedOrigins },
        { url: attachUrl(), origin: "https://ide.test" },
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects a path that is not the attach endpoint", async () => {
    stubUpstream();
    await expect(
      authorizePtyAttach(
        config,
        { mode: "interactive", allowedOrigins },
        { url: "/api/events?directory=/tmp", origin: "https://ide.test" },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("PTY audit trail", () => {
  const makeService = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dca-pty-audit-"));
    const history = new HistoryStore(path.join(dir, "history.json"));
    const store = new PreferenceStore(path.join(dir, "prefs.json"));
    const bus = new EventBus({ baseUrl: "http://opencode.test" });
    const service = new PtyAuditService(bus, store, history);
    service.start();
    return { history, bus, service };
  };

  it("records a terminal being started, with its command and cwd", async () => {
    const { history, bus, service } = await makeService();
    bus.emit("event", {
      type: "pty.created",
      directory: "/tmp/project",
      properties: { info: { id: "pty_1", title: "shell", command: "/bin/bash", cwd: "/tmp/project" } },
    });
    await vi.waitFor(async () => expect(await history.list({ kind: "pty" })).toHaveLength(1));
    const [record] = await history.list({ kind: "pty" });
    expect(record).toMatchObject({ kind: "pty", title: "Terminal started", directory: "/tmp/project" });
    expect(record?.body).toContain("/bin/bash");
    service.stop();
  });

  it("records an exit with its code", async () => {
    const { history, bus, service } = await makeService();
    bus.emit("event", { type: "pty.exited", directory: "/tmp/project", properties: { id: "pty_1", exitCode: 130 } });
    await vi.waitFor(async () => expect(await history.list({ kind: "pty" })).toHaveLength(1));
    expect((await history.list({ kind: "pty" }))[0]?.body).toContain("130");
    service.stop();
  });

  it("records who attached and in which mode, which upstream never emits", async () => {
    const { history, service } = await makeService();
    service.recordAttach({
      directory: "/tmp/project",
      ptyID: "pty_1",
      readOnly: true,
      origin: "https://ide.test",
    });
    await vi.waitFor(async () => expect(await history.list({ kind: "pty" })).toHaveLength(1));
    const [record] = await history.list({ kind: "pty" });
    expect(record?.title).toBe("Terminal attached");
    expect(record?.body).toContain("read-only");
    expect(record?.body).toContain("https://ide.test");
    service.stop();
  });

  it("records even though delivery is off by default, because audit is not alerting", async () => {
    const { history, bus, service } = await makeService();
    bus.emit("event", {
      type: "pty.created",
      directory: "/tmp/project",
      properties: { info: { id: "pty_1", command: "/bin/zsh", cwd: "/tmp/project" } },
    });
    await vi.waitFor(async () => expect(await history.list({ kind: "pty" })).toHaveLength(1));
    // "pty" defaults to false in both delivery maps: the ping is opt-in, the
    // record is not.
    expect((await history.list({ kind: "pty" }))[0]?.delivery).toMatchObject({ ntfy: "off", desktop: "off" });
    service.stop();
  });

  it("ignores unrelated and malformed events without throwing", async () => {
    const { history, bus, service } = await makeService();
    bus.emit("event", { type: "session.idle", properties: { sessionID: "ses_1" } });
    bus.emit("event", { type: "pty.created", properties: {} });
    bus.emit("event", { type: "pty.exited", properties: {} });
    bus.emit("event", { type: "pty.deleted", properties: { id: "pty_1" } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // pty.deleted is deliberately not recorded: a kill already produced an exit.
    expect(await history.list({ kind: "pty" })).toHaveLength(0);
    service.stop();
  });
});
