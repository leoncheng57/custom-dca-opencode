// server/opencode/pty.ts — upstream seam for OpenCode's PTY API.
//
// Audited live against opencode 1.18.21 (`GET /doc`, 162 paths). Everything
// here is on the CLASSIC surface, so AGENTS.md #6 holds; the /api/** twin also
// carries PTY routes but lacks /pty/shells, and we would gain nothing.
//
//   POST   /pty                     create   -> Pty
//   GET    /pty                     list     -> Pty[]     (scoped by ?directory=)
//   GET    /pty/{id}                inspect  -> Pty | 404
//   PUT    /pty/{id}                resize / retitle
//   DELETE /pty/{id}                kill
//   GET    /pty/shells              -> { path, name, acceptable }[]
//   GET    /pty/{id}/connect        WebSocket upgrade
//   POST   /pty/{id}/connect-token  short-lived ticket
//
// Four findings from that audit that shape the code below, none of which are
// visible in the schema:
//
//  1. `Pty` has NO directory field, but the directory IS the partition key.
//     `GET /pty/{id}?directory=<other project>` answers 404, and an unscoped
//     `GET /pty` answers []. So confinement is checkable: to prove a PTY
//     belongs to a project, fetch it scoped to that project.
//
//  2. `POST /pty` overwrites `args` with ["-l"] — it always spawns a LOGIN
//     shell. Whatever the caller asks for, the result reads the host's profile
//     and inherits the host environment. This is the concrete reason
//     AGENTS.md #3's permission map does not apply.
//
//  3. `POST /pty` accepts any `cwd`, including /etc. Upstream performs no
//     containment whatsoever; PROJECTS_DIR confinement is entirely ours.
//
//  4. `POST /pty/{id}/connect-token` answers 403 PtyForbiddenError in 1.18.21 —
//     both on an unsecured server AND on one started with
//     OPENCODE_SERVER_PASSWORD while sending valid basic auth. The ticket
//     exists so a *browser* can authenticate a WebSocket, which cannot carry
//     custom headers. The BFF is a Node client and has no such limitation: it
//     sends Authorization on the upgrade, which was verified to work (401
//     without it, 101 with it). We therefore never mint a ticket. That is
//     strictly better for the "no upstream credential reaches the browser"
//     requirement, because the credential-equivalent never comes into
//     existence.

import { request, basicAuthHeader, type OpencodeConfig } from "./client.js";

/** Mirrors the upstream `Pty` schema exactly. Note the absent directory. */
export interface Pty {
  id: string;
  title: string;
  command: string;
  args: string[];
  cwd: string;
  status: "running" | "exited";
  pid: number;
  exitCode?: number;
}

export interface PtyShell {
  path: string;
  name: string;
  acceptable: boolean;
}

export interface PtySize {
  rows: number;
  cols: number;
}

export function listPtys(config: OpencodeConfig, directory: string): Promise<Pty[]> {
  return request<Pty[]>(config, "/pty", { directory });
}

export function getPty(config: OpencodeConfig, directory: string, ptyID: string): Promise<Pty> {
  return request<Pty>(config, `/pty/${encodeURIComponent(ptyID)}`, { directory });
}

export function listPtyShells(config: OpencodeConfig, directory: string): Promise<PtyShell[]> {
  return request<PtyShell[]>(config, "/pty/shells", { directory });
}

/**
 * `env` is never forwarded from a caller. The browser has no business seeding
 * the environment of a host process, and upstream merges whatever it is given
 * into the login shell.
 */
export function createPty(
  config: OpencodeConfig,
  directory: string,
  input: { command?: string; cwd: string; title?: string },
): Promise<Pty> {
  return request<Pty>(config, "/pty", {
    method: "POST",
    directory,
    body: {
      ...(input.command ? { command: input.command } : {}),
      cwd: input.cwd,
      ...(input.title ? { title: input.title } : {}),
    },
  });
}

export function updatePty(
  config: OpencodeConfig,
  directory: string,
  ptyID: string,
  input: { title?: string; size?: PtySize },
): Promise<Pty> {
  return request<Pty>(config, `/pty/${encodeURIComponent(ptyID)}`, {
    method: "PUT",
    directory,
    body: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.size ? { size: input.size } : {}),
    },
  });
}

export function removePty(config: OpencodeConfig, directory: string, ptyID: string): Promise<boolean> {
  return request<boolean>(config, `/pty/${encodeURIComponent(ptyID)}`, {
    method: "DELETE",
    directory,
  });
}

/**
 * The upstream WebSocket URL for a PTY, plus the headers that authenticate it.
 *
 * Returned together so a caller cannot accidentally build the URL and forget
 * the credential, and so neither ever crosses into browser-facing code.
 */
export function ptySocketTarget(
  config: OpencodeConfig,
  directory: string,
  ptyID: string,
): { url: string; headers: Record<string, string> } {
  const url = new URL(`/pty/${encodeURIComponent(ptyID)}/connect`, config.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("directory", directory);
  const auth = basicAuthHeader(config);
  return { url: url.toString(), headers: auth ? { Authorization: auth } : {} };
}

/**
 * Upstream multiplexes two things over one socket: text frames carrying raw
 * terminal bytes, and BINARY frames whose first byte is NUL followed by JSON
 * control data (observed: `\x00{"cursor":284}`, a replay offset).
 *
 * The BFF speaks only the byte stream to the browser, so control frames are
 * recognised here and dropped rather than handed to xterm.js, which would
 * render them as garbage.
 */
export function isPtyControlFrame(data: Buffer, isBinary: boolean): boolean {
  return isBinary && data.length > 0 && data[0] === 0x00;
}
