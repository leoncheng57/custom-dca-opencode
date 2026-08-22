// tests/pty-server.test.ts — the PTY feature end to end inside one process.
//
// A real Express BFF with the real router and the real upgrade handler, talking
// to a real (stub) upstream over real HTTP and a real WebSocket. Unit tests can
// prove the predicates; only this can prove the wiring — that the Origin check
// actually runs on the handshake, that read-only actually drops keystrokes on
// the socket rather than merely rendering a disabled caret, and that an unset
// flag means the routes are absent rather than refusing.

import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ptyRoutes } from "../server/routes/pty.js";
import { attachPtySocket } from "../server/routes/ptySocket.js";
import { ptyOriginAllowlist, type PtyMode } from "../server/ptyPolicy.js";

const ORIGIN = "https://ide.test";
const allowedOrigins = ptyOriginAllowlist({ publicAppUrl: ORIGIN });

let project: string;
let outsideRoot: string;

interface Upstream {
  url: string;
  close: () => Promise<void>;
  /** Everything the stub PTY received from the BFF, in order. */
  received: string[];
  /** Origin headers the stub saw on its own upgrade, to prove none leaked. */
  upgradeHeaders: Array<Record<string, string | string[] | undefined>>;
  send: (data: string) => void;
  sendControl: (json: string) => void;
}

/** A stand-in for opencode's PTY surface: just enough to exercise the proxy. */
async function startUpstream(options: { ptyDirectory: string }): Promise<Upstream> {
  const received: string[] = [];
  const upgradeHeaders: Upstream["upgradeHeaders"] = [];
  let socket: WebSocket | null = null;

  const pty = {
    id: "pty_stub",
    title: "stub",
    command: "/bin/bash",
    args: ["-l"],
    cwd: options.ptyDirectory,
    status: "running" as const,
    pid: 999,
  };

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const directory = url.searchParams.get("directory");
    const respond = (status: number, value: unknown): void => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    // Mirrors the real server: the directory is the partition key even though
    // `Pty` carries no directory field, and a foreign directory 404s.
    const scoped = directory === options.ptyDirectory;

    if (url.pathname === "/pty/shells") {
      return respond(200, [
        { path: "/bin/bash", name: "bash", acceptable: true },
        { path: "/bin/false", name: "false", acceptable: false },
      ]);
    }
    if (url.pathname === "/pty" && req.method === "GET") return respond(200, scoped ? [pty] : []);
    if (url.pathname === "/pty" && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const input = JSON.parse(raw || "{}") as Record<string, unknown>;
        // Upstream forces a login shell whatever it is asked for.
        respond(200, { ...pty, ...input, args: ["-l"] });
      });
      return;
    }
    if (url.pathname === "/pty/pty_stub") {
      if (!scoped) return respond(404, { _tag: "PtyNotFoundError", ptyID: "pty_stub", message: "not found" });
      if (req.method === "DELETE") return respond(200, true);
      if (req.method === "PUT") {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => respond(200, { ...pty, ...(JSON.parse(raw || "{}") as object) }));
        return;
      }
      return respond(200, pty);
    }
    respond(404, { error: `stub: ${req.method} ${url.pathname}` });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, duplex, head) => {
    upgradeHeaders.push({ ...req.headers });
    wss.handleUpgrade(req, duplex, head, (ws) => {
      socket = ws;
      ws.on("message", (data) => received.push(data.toString("utf8")));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    upgradeHeaders,
    send: (data) => socket?.send(data, { binary: false }),
    sendControl: (payload) => socket?.send(Buffer.concat([Buffer.from([0]), Buffer.from(payload)]), { binary: true }),
    close: () =>
      new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      }),
  };
}

interface Bff {
  url: string;
  wsUrl: string;
  close: () => Promise<void>;
}

async function startBff(
  mode: PtyMode,
  upstream: { baseUrl: string; username?: string; password?: string },
  shell: string | null = null,
): Promise<Bff> {
  const app = express();
  app.use(express.json());
  const config = upstream;
  if (mode !== "off") app.use("/api", ptyRoutes(config, { mode, shell }));

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  if (mode !== "off") attachPtySocket(server, config, { mode, allowedOrigins });

  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => void server.close(() => resolve())),
  };
}

const running: Array<() => Promise<void>> = [];

beforeAll(async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "dca-pty-e2e-")));
  project = path.join(root, "project");
  outsideRoot = path.join(root, "elsewhere");
  await mkdir(path.join(project, "src"), { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  process.env.PROJECTS_DIR = root;
});

afterEach(async () => {
  for (const close of running.splice(0)) await close();
});

async function bootstrap(mode: PtyMode, shell: string | null = null) {
  const upstream = await startUpstream({ ptyDirectory: project });
  const bff = await startBff(mode, { baseUrl: upstream.url }, shell);
  running.push(bff.close, upstream.close);
  const scoped = (suffix: string, directory = project) =>
    `${bff.url}/api${suffix}${suffix.includes("?") ? "&" : "?"}directory=${encodeURIComponent(directory)}`;
  return { upstream, bff, scoped };
}

/** Open a browser-side socket and collect what the BFF sends back. */
function attach(
  bff: Bff,
  directory: string,
  origin: string | undefined,
  id = "pty_stub",
): Promise<{ status: "open"; socket: WebSocket; frames: string[] } | { status: "refused"; code: number }> {
  const url = `${bff.wsUrl}/api/pty/${id}/attach?directory=${encodeURIComponent(directory)}`;
  const socket = new WebSocket(url, origin ? { headers: { Origin: origin } } : {});
  const frames: string[] = [];
  socket.on("message", (data) => frames.push(data.toString("utf8")));
  return new Promise((resolve) => {
    socket.on("open", () => resolve({ status: "open", socket, frames }));
    socket.on("unexpected-response", (_req, res) => {
      res.resume();
      resolve({ status: "refused", code: res.statusCode ?? 0 });
    });
    socket.on("error", () => resolve({ status: "refused", code: 0 }));
  });
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

describe("PTY_ENABLED unset", () => {
  it("does not mount the routes at all", async () => {
    // Issue #59 asked for "absent flag means the routes do not exist", which is
    // a deliberate departure from previewRoutes' always-mounted-then-403.
    const { bff, scoped } = await bootstrap("off");
    expect((await fetch(scoped("/pty"))).status).toBe(404);
    expect((await fetch(`${bff.url}/api/pty/capabilities`)).status).toBe(404);
  });

  it("carries no WebSocket server, so an attach cannot even be attempted", async () => {
    const { bff } = await bootstrap("off");
    expect(await attach(bff, project, ORIGIN)).toMatchObject({ status: "refused" });
  });
});

describe("read-only mode", () => {
  it("advertises exactly what it will do", async () => {
    const { bff } = await bootstrap("read-only");
    const capabilities = await (await fetch(`${bff.url}/api/pty/capabilities`)).json();
    expect(capabilities).toMatchObject({
      mode: "read-only",
      canCreate: false,
      canInput: false,
      canUpdate: false,
      // Cancelling a runaway process is the point of the read-only surface.
      canKill: true,
    });
  });

  it("lists and inspects", async () => {
    const { scoped } = await bootstrap("read-only");
    const listed = await (await fetch(scoped("/pty"))).json();
    expect(listed.ptys).toHaveLength(1);
    expect((await fetch(scoped("/pty/pty_stub"))).status).toBe(200);
  });

  it("refuses to create, resize or enumerate shells", async () => {
    const { scoped } = await bootstrap("read-only");
    const created = await fetch(scoped("/pty"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(created.status).toBe(403);
    expect((await fetch(scoped("/pty/shells"))).status).toBe(403);
    const resized = await fetch(scoped("/pty/pty_stub"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size: { rows: 40, cols: 120 } }),
    });
    expect(resized.status).toBe(403);
  });

  it("still allows a kill", async () => {
    const { scoped } = await bootstrap("read-only");
    const killed = await fetch(scoped("/pty/pty_stub"), { method: "DELETE" });
    expect(killed.status).toBe(200);
    expect(await killed.json()).toEqual({ removed: true });
  });

  it("streams output but silently drops every keystroke on the socket", async () => {
    const { bff, upstream } = await bootstrap("read-only");
    const result = await attach(bff, project, ORIGIN);
    expect(result.status).toBe("open");
    if (result.status !== "open") return;

    await settle();
    upstream.send("total 0\r\n");
    await settle();
    expect(result.frames.join("")).toContain("total 0");

    // The important half: a read-only client that tries anyway gets nowhere.
    result.socket.send("rm -rf /\r");
    await settle();
    expect(upstream.received).toEqual([]);
    result.socket.close();
  });
});

describe("interactive mode", () => {
  it("pipes keystrokes upstream and output back", async () => {
    const { bff, upstream } = await bootstrap("interactive");
    const result = await attach(bff, project, ORIGIN);
    expect(result.status).toBe("open");
    if (result.status !== "open") return;

    await settle();
    result.socket.send("echo hi\r");
    await settle();
    expect(upstream.received).toEqual(["echo hi\r"]);

    upstream.send("hi\r\n");
    await settle();
    expect(result.frames.join("")).toContain("hi");
    result.socket.close();
  });

  it("swallows upstream's binary control frames instead of rendering them", async () => {
    // Observed live: \x00{"cursor":284}. xterm.js would print it as garbage.
    const { bff, upstream } = await bootstrap("interactive");
    const result = await attach(bff, project, ORIGIN);
    if (result.status !== "open") throw new Error("expected an open socket");
    await settle();
    upstream.sendControl('{"cursor":284}');
    upstream.send("visible");
    await settle();
    expect(result.frames.join("")).toBe("visible");
    result.socket.close();
  });

  it("never forwards a binary frame from the browser to upstream's control channel", async () => {
    const { bff, upstream } = await bootstrap("interactive");
    const result = await attach(bff, project, ORIGIN);
    if (result.status !== "open") throw new Error("expected an open socket");
    await settle();
    result.socket.send(Buffer.from([0x00, 0x7b, 0x7d]), { binary: true });
    await settle();
    expect(upstream.received).toEqual([]);
    result.socket.close();
  });

  it("creates a terminal, confining cwd to the project", async () => {
    const { scoped } = await bootstrap("interactive");
    const created = await fetch(scoped("/pty"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: "src", title: "build" }),
    });
    expect(created.status).toBe(201);
    expect((await created.json()).pty.cwd).toBe(path.join(project, "src"));
  });

  it.each([
    ["../elsewhere", "traversal"],
    ["/etc", "an absolute path"],
    ["missing", "a nonexistent directory"],
  ])("refuses %s as a cwd (%s)", async (cwd) => {
    // Upstream accepts any cwd, including /etc — verified live. This is the
    // only thing keeping a shell inside PROJECTS_DIR.
    const { scoped } = await bootstrap("interactive");
    const created = await fetch(scoped("/pty"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd }),
    });
    expect(created.status).toBeGreaterThanOrEqual(400);
    expect(created.status).toBeLessThan(500);
  });

  it("only spawns a shell the host reports as acceptable", async () => {
    const { scoped } = await bootstrap("interactive");
    const ok = await fetch(scoped("/pty"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shell: "/bin/bash" }),
    });
    expect(ok.status).toBe(201);
    for (const shell of ["/bin/false", "/usr/bin/curl", "not-a-path"]) {
      const rejected = await fetch(scoped("/pty"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shell }),
      });
      expect(rejected.status).toBe(400);
    }
  });

  it("lets PTY_SHELL pin the shell beyond the browser's reach", async () => {
    const { scoped } = await bootstrap("interactive", "/bin/bash");
    const pinned = await fetch(scoped("/pty"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shell: "/bin/zsh" }),
    });
    expect(pinned.status).toBe(400);
    expect((await pinned.json()).error).toMatch(/pinned by PTY_SHELL/);
  });

  it("rejects unknown body fields rather than forwarding them", async () => {
    // `env` in particular: the browser has no business seeding the environment
    // of a host process, and upstream merges whatever it is handed.
    const { scoped } = await bootstrap("interactive");
    const created = await fetch(scoped("/pty"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ env: { LD_PRELOAD: "/tmp/evil.so" } }),
    });
    expect(created.status).toBe(400);
    expect((await created.json()).error).toMatch(/unexpected body field 'env'/);
  });
});

describe("handshake gates on a live socket", () => {
  it("refuses a foreign origin with 403 before upgrading", async () => {
    // The reason this test exists: browsers do not apply CORS to WebSocket
    // handshakes, and opencode itself happily accepts Origin: evil.example.
    const { bff } = await bootstrap("interactive");
    expect(await attach(bff, project, "https://evil.example")).toEqual({ status: "refused", code: 403 });
  });

  it("refuses a handshake that sends no Origin at all", async () => {
    const { bff } = await bootstrap("interactive");
    expect(await attach(bff, project, undefined)).toEqual({ status: "refused", code: 403 });
  });

  it("refuses a directory outside PROJECTS_DIR", async () => {
    const { bff } = await bootstrap("interactive");
    const result = await attach(bff, "/etc", ORIGIN);
    expect(result.status).toBe("refused");
  });

  it("refuses a PTY that belongs to another project", async () => {
    const { bff } = await bootstrap("interactive");
    expect(await attach(bff, outsideRoot, ORIGIN)).toMatchObject({ status: "refused" });
  });

  it("refuses an unknown PTY id", async () => {
    const { bff } = await bootstrap("interactive");
    expect(await attach(bff, project, ORIGIN, "pty_missing")).toEqual({ status: "refused", code: 404 });
  });

  it("leaves non-PTY upgrade paths alone instead of hijacking them", async () => {
    const { bff } = await bootstrap("interactive");
    const socket = new WebSocket(`${bff.wsUrl}/api/events`, { headers: { Origin: ORIGIN } });
    const outcome = await new Promise<string>((resolve) => {
      socket.on("open", () => resolve("open"));
      socket.on("unexpected-response", (_req, res) => {
        res.resume();
        resolve(`http-${res.statusCode}`);
      });
      socket.on("error", () => resolve("error"));
    });
    // Refused, not hung. Registering an upgrade listener for PTY suppressed
    // Node's default destruction of every OTHER upgrade, so the handler has to
    // restore it or unrelated paths leak sockets.
    expect(outcome).not.toBe("open");
  });
});

describe("what reaches the browser", () => {
  it("never leaks the upstream origin, credential or a connect ticket", async () => {
    const upstream = await startUpstream({ ptyDirectory: project });
    const bff = await startBff("interactive", {
      baseUrl: upstream.url,
      username: "opencode",
      password: "s3cret",
    });
    running.push(bff.close, upstream.close);

    const result = await attach(bff, project, ORIGIN);
    if (result.status !== "open") throw new Error("expected an open socket");
    await settle();
    upstream.send("prompt$ ");
    await settle();

    const seen = result.frames.join("");
    expect(seen).toBe("prompt$ ");
    expect(seen).not.toContain("s3cret");
    expect(seen).not.toContain("ticket");

    // The credential travelled on the BFF's own upgrade, where the browser
    // cannot see it. connect-token is never called: it is 403 in 1.18.21 and
    // the BFF, unlike a browser, can just send the header.
    const [headers] = upstream.upgradeHeaders;
    expect(headers?.authorization).toBeTruthy();
    result.socket.close();
  });
});
