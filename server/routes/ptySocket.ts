// server/routes/ptySocket.ts — BFF-mediated WebSocket proxy for one PTY.
//
// Express 5 does not speak WebSocket, so this attaches a raw `upgrade` listener
// to the http.Server that app.listen() returns. That is a smaller change than
// swapping the framework and keeps every HTTP route untouched.
//
// Browser                      BFF                         opencode
//   ws://<app>/api/pty/:id/attach  ──►  ws://<opencode>/pty/:id/connect
//                                       + Authorization: Basic …
//
// What the browser never learns: the OpenCode origin, the basic-auth
// credential, and any connect ticket. The last one is free — see the audit note
// in server/opencode/pty.ts: connect-token is 403 in 1.18.21 and the BFF, being
// a Node client, can send the Authorization header the browser cannot. So no
// credential-equivalent is ever minted, let alone handed out.
//
// Four gates run before a single byte flows, in this order, because each one is
// cheaper and more certain than the next:
//
//   1. Mode  — the feature is on at all.
//   2. Origin — an allowlist, NOT derived from the Host header. Browsers do not
//      apply CORS to WebSocket handshakes and opencode itself accepts
//      `Origin: http://evil.example` (verified live), so without this any page
//      the user visits could open a shell at the app's tailnet origin.
//   3. Directory — the usual PROJECTS_DIR/worktree confinement.
//   4. Ownership — GET /pty/{id}?directory= must succeed. Upstream answers 404
//      when the PTY belongs to another project, which is what makes step 3
//      mean something for an id the caller supplied.
//
// Only then is the upstream socket dialled. In read-only mode every
// browser→BFF frame is dropped on the floor.

import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket, type RawData } from "ws";

import { OpencodeError, type OpencodeConfig } from "../opencode/client.js";
import { getPty, isPtyControlFrame, ptySocketTarget } from "../opencode/pty.js";
import { PathError, requireWorkspaceDirectory } from "../paths.js";
import { isAllowedPtyOrigin, ptyAllowsInput, type PtyMode } from "../ptyPolicy.js";

export const PTY_ATTACH_PATH = /^\/api\/pty\/(pty[A-Za-z0-9_-]*)\/attach$/;

/** Bound so a wedged browser cannot pin unbounded memory in the BFF. */
const MAX_INPUT_FRAME_BYTES = 64 * 1024;
const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;

export interface PtySocketOptions {
  mode: PtyMode;
  /** Canonical origins permitted to complete the handshake. */
  allowedOrigins: readonly string[];
  /** Called once per accepted attach, for the audit trail. */
  onAttach?: (event: { directory: string; ptyID: string; readOnly: boolean; origin: string }) => void;
}

export class HandshakeError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    message: string,
  ) {
    super(message);
    this.name = "HandshakeError";
  }
}

/**
 * Refuse before the upgrade completes.
 *
 * Deliberately an HTTP response on the raw socket rather than an accepted
 * WebSocket that immediately closes: a rejected handshake is visible to the
 * browser as a failure, and never gives the page a socket object at all.
 */
function refuse(socket: Duplex, status: number, statusText: string): void {
  socket.write(
    `HTTP/1.1 ${status} ${statusText}\r\n` +
      "Connection: close\r\n" +
      "Content-Length: 0\r\n" +
      "\r\n",
  );
  socket.destroy();
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Everything that must hold before an upstream connection is opened. Exported
 * so the gates can be tested without sockets.
 */
export async function authorizePtyAttach(
  config: OpencodeConfig,
  options: PtySocketOptions,
  input: { url: string; origin: string | undefined },
): Promise<{ ptyID: string; directory: string; origin: string }> {
  if (options.mode === "off") {
    throw new HandshakeError(404, "Not Found", "the PTY terminal is disabled on this server");
  }

  const url = new URL(input.url, "http://bff.invalid");
  const match = PTY_ATTACH_PATH.exec(url.pathname);
  if (!match) {
    throw new HandshakeError(404, "Not Found", "no PTY attach endpoint at this path");
  }
  const ptyID = match[1] as string;

  if (!isAllowedPtyOrigin(input.origin, options.allowedOrigins)) {
    // Do not echo the allowlist back: a rejected page should learn only that it
    // was rejected.
    throw new HandshakeError(403, "Forbidden", "origin is not permitted to attach to a terminal");
  }

  let directory: string;
  try {
    directory = await requireWorkspaceDirectory(url.searchParams.get("directory"));
  } catch (error) {
    if (error instanceof PathError) {
      throw new HandshakeError(
        error.status,
        error.status === 403 ? "Forbidden" : "Bad Request",
        error.message,
      );
    }
    throw error;
  }

  try {
    // Proves the PTY exists AND belongs to this project: upstream 404s a PTY
    // addressed through any other directory.
    await getPty(config, directory, ptyID);
  } catch (error) {
    if (error instanceof OpencodeError && error.status >= 400 && error.status < 500) {
      throw new HandshakeError(404, "Not Found", "terminal not found in this project");
    }
    throw new HandshakeError(502, "Bad Gateway", "the agent server did not answer");
  }

  return { ptyID, directory, origin: input.origin as string };
}

/**
 * Pipe an accepted browser socket to a fresh upstream socket.
 *
 * Frames in each direction:
 *   browser → BFF : text = stdin bytes. Dropped entirely in read-only mode.
 *                   Binary is always dropped — the browser has no control
 *                   protocol, and forwarding arbitrary binary would let a page
 *                   speak upstream's control channel.
 *   BFF → browser : text = terminal output. Upstream's binary control frames
 *                   (leading NUL + JSON, e.g. {"cursor":284}) are consumed here
 *                   so xterm.js never renders them as garbage.
 *
 * Resize is intentionally NOT on this socket; it is PUT /api/pty/:id, so the
 * socket stays a pure byte pipe and resizing goes through the same mode check
 * as every other mutation.
 */
function bridge(
  browser: WebSocket,
  config: OpencodeConfig,
  directory: string,
  ptyID: string,
  readOnly: boolean,
): void {
  const target = ptySocketTarget(config, directory, ptyID);
  const upstream = new WebSocket(target.url, { headers: target.headers });

  const pending: RawData[] = [];
  let open = false;

  const shutdown = (code: number, reason: string): void => {
    // 1011 and friends must be inside the valid application range; ws throws
    // on anything else, which would replace a clean close with a crash.
    const safe = code >= 1000 && code <= 4999 ? code : 1011;
    if (browser.readyState === WebSocket.OPEN) browser.close(safe, reason.slice(0, 120));
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
    }
  };

  const connectTimer = setTimeout(() => {
    if (!open) shutdown(1013, "agent server did not accept the terminal connection");
  }, UPSTREAM_CONNECT_TIMEOUT_MS);

  upstream.on("open", () => {
    open = true;
    clearTimeout(connectTimer);
    for (const frame of pending.splice(0)) upstream.send(frame);
  });

  upstream.on("message", (data: RawData, isBinary: boolean) => {
    if (browser.readyState !== WebSocket.OPEN) return;
    const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBufferLike);
    if (isPtyControlFrame(buffer, isBinary)) return;
    browser.send(buffer, { binary: false });
  });

  upstream.on("close", () => {
    clearTimeout(connectTimer);
    shutdown(1000, "terminal closed");
  });
  upstream.on("error", () => {
    clearTimeout(connectTimer);
    shutdown(1011, "terminal connection failed");
  });

  browser.on("message", (data: RawData, isBinary: boolean) => {
    if (readOnly || isBinary) return;
    const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBufferLike);
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_INPUT_FRAME_BYTES) return;
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(buffer);
    } else if (pending.length < 32) {
      pending.push(buffer);
    }
  });

  browser.on("close", () => {
    clearTimeout(connectTimer);
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
    }
  });
  browser.on("error", () => shutdown(1011, "terminal connection failed"));
}

/**
 * Attach the upgrade handler. Called only when the feature is enabled, so an
 * `off` deployment carries no WebSocket server at all.
 */
export function attachPtySocket(
  server: Server,
  config: OpencodeConfig,
  options: PtySocketOptions,
): WebSocketServer {
  // noServer: the handshake is completed by hand only after every gate passes.
  const wss = new WebSocketServer({ noServer: true });
  const readOnly = !ptyAllowsInput(options.mode);

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = req.url ?? "/";
    if (!PTY_ATTACH_PATH.test(new URL(url, "http://bff.invalid").pathname)) {
      // Node destroys an upgrade request only when the server has NO 'upgrade'
      // listener. Registering this one therefore silently made every other
      // upgrade path hang open forever instead of being refused — including
      // /api/events, which is an SSE endpoint a client might mistakenly try to
      // upgrade. Restore the default explicitly.
      //
      // If a second upgrade consumer is ever added, it must be routed from
      // here rather than attached as its own listener, or this line will eat
      // its handshakes.
      socket.destroy();
      return;
    }

    socket.on("error", () => socket.destroy());

    void authorizePtyAttach(config, options, { url, origin: headerValue(req, "origin") })
      .then(({ ptyID, directory, origin }) => {
        wss.handleUpgrade(req, socket, head, (browser) => {
          options.onAttach?.({ directory, ptyID, readOnly, origin });
          bridge(browser, config, directory, ptyID, readOnly);
        });
      })
      .catch((error: unknown) => {
        if (error instanceof HandshakeError) {
          refuse(socket, error.status, error.statusText);
          return;
        }
        refuse(socket, 500, "Internal Server Error");
      });
  });

  return wss;
}
