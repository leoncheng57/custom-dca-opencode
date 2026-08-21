// server/opencode/client.ts
//
// The single seam between this app and the OpenCode server. Everything that
// talks to the agent goes through here — the equivalent of the OpenHands
// runner's server/openhands/upstream.ts.
//
// Three things this module owns, learned the hard way during the API audit
// (docs/research/opencode-build-plan.html):
//
//  1. DIRECTORY SCOPING. Almost every instance-scoped route takes a
//     `?directory=<abs path>` query param, and it is the project selector.
//     Omit it and you get the directory the server was started in, which is
//     almost never what a multi-project UI wants. One server serves all
//     projects (verified: 32 projects / 2,483 sessions on one instance).
//
//  2. AUTH. `opencode serve` supports optional HTTP Basic auth via
//     OPENCODE_SERVER_PASSWORD (username defaults to "opencode"). It covers
//     the SSE streams too. EventSource cannot set headers, so the server also
//     accepts `?auth_token=<base64(user:pass)>` — see eventStreamUrl().
//
//  3. VERSION PINNING. The published docs lag the binary badly (~60 paths
//     documented vs 162 live). We generate nothing at build time; we depend on
//     @opencode-ai/sdk pinned to the exact server version and assert at boot.
//
// Deliberately NOT used here: the `/api/**` v2 surface. It is newer,
// event-sourced, contractually 401-gated and still moving. Everything this app
// needs exists on the classic surface. Revisit per decision #6 in AGENTS.md.

import { createOpencodeClient } from "@opencode-ai/sdk";

/** Pinned server version this client is generated against. */
export const EXPECTED_SERVER_VERSION = "1.18.19";

export interface OpencodeConfig {
  /** Base URL of the running `opencode serve` / `opencode web` instance. */
  baseUrl: string;
  /** Basic-auth username. Only used when a password is set. */
  username?: string;
  /** Basic-auth password (OPENCODE_SERVER_PASSWORD). Unset = unsecured server. */
  password?: string;
}

export function readOpencodeConfig(env: NodeJS.ProcessEnv = process.env): OpencodeConfig {
  return {
    baseUrl: env.OPENCODE_URL?.replace(/\/+$/, "") || "http://127.0.0.1:4096",
    username: env.OPENCODE_SERVER_USERNAME || "opencode",
    password: env.OPENCODE_SERVER_PASSWORD || undefined,
  };
}

/** `Authorization: Basic …` value, or undefined on an unsecured server. */
export function basicAuthHeader(config: OpencodeConfig): string | undefined {
  if (!config.password) return undefined;
  const raw = `${config.username || "opencode"}:${config.password}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

/**
 * SSE URL for the cross-project event bus.
 *
 * Uses /global/event, NOT /event: the latter is directory-scoped, so a
 * multi-project UI subscribing to it silently misses every other project's
 * events. /global/event wraps each event as `{ directory, project?, workspace?,
 * payload }` — demux on `payload` after reading `directory`.
 *
 * Basic auth is passed as a query param because EventSource cannot set
 * headers; the server accepts `auth_token` for exactly this reason.
 */
export function eventStreamUrl(config: OpencodeConfig): string {
  const url = new URL("/global/event", config.baseUrl);
  if (config.password) {
    const raw = `${config.username || "opencode"}:${config.password}`;
    url.searchParams.set("auth_token", Buffer.from(raw, "utf8").toString("base64"));
  }
  return url.toString();
}

export type OpencodeClient = ReturnType<typeof createOpencodeClient>;

/**
 * Build a client scoped to a project directory.
 *
 * Pass `directory` for anything project-specific (sessions, files, vcs, mcp).
 * Omit it only for genuinely global reads (/global/health, /project).
 */
export function createClient(config: OpencodeConfig, directory?: string): OpencodeClient {
  const auth = basicAuthHeader(config);
  return createOpencodeClient({
    baseUrl: config.baseUrl,
    ...(directory ? { directory } : {}),
    ...(auth ? { headers: { Authorization: auth } } : {}),
  });
}

export interface ServerHealth {
  healthy: boolean;
  version: string;
  /** True when the live server matches EXPECTED_SERVER_VERSION. */
  versionMatches: boolean;
}

/**
 * Boot check. A version skew is not fatal — the running instance is often a
 * release behind the installed binary — but it is the first thing to suspect
 * when a response shape looks wrong, so surface it rather than hiding it.
 */
export async function checkHealth(config: OpencodeConfig): Promise<ServerHealth> {
  const headers: Record<string, string> = {};
  const auth = basicAuthHeader(config);
  if (auth) headers.Authorization = auth;

  const res = await fetch(new URL("/global/health", config.baseUrl), { headers });
  if (!res.ok) throw new Error(`opencode health check failed: HTTP ${res.status}`);

  const body = (await res.json()) as { healthy?: boolean; version?: string };
  const version = body.version ?? "unknown";
  return {
    healthy: body.healthy === true,
    version,
    versionMatches: version === EXPECTED_SERVER_VERSION,
  };
}
