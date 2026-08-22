// server/ptyPolicy.ts — the access-control decisions for the PTY terminal.
//
// Kept pure and free of I/O so every branch is unit-testable without a server,
// because this file is the whole boundary. A PTY is the largest privilege grant
// in the product and none of the existing protections reach it:
//
//   - AGENTS.md #3 makes opencode.json's permission map the container
//     substitute, but those rules apply to *agent tool calls*. A PTY spawns a
//     login shell with the host environment, so `bash "*": "ask"`,
//     `sudo *: deny` and the read-denies on ~/.ssh and auth.json simply do not
//     execute. Verified against opencode 1.18.21: POST /pty forces args ["-l"].
//   - The BFF has no browser-facing auth; the tailnet is the perimeter.
//   - Browsers do not apply the same-origin policy to WebSocket handshakes, so
//     any page the user visits could open a socket at the app's tailnet origin.
//     Verified upstream: opencode accepts a handshake carrying
//     `Origin: http://evil.example` without complaint. Origin validation is
//     ours to do or it does not happen.
//
// Two knobs, both fail-closed:
//   PTY_ENABLED         off (default) | read-only | interactive
//   PTY_ALLOWED_ORIGINS extra browser origins permitted to upgrade

/**
 * `read-only` is deliberately the alias for the truthy spellings. The issue
 * that requested this feature proposed `PTY_ENABLED=1`, but making the most
 * dangerous mode the one you get by typing the most obvious value is a footgun.
 * Interactive input has to be asked for by name.
 */
export type PtyMode = "off" | "read-only" | "interactive";

export class PtyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PtyConfigError";
  }
}

/**
 * Throws rather than degrading, matching parsePublicAppUrl: a typo in the flag
 * that silently downgraded `interactive` to `off` would look like a bug in the
 * UI, and one that silently upgraded `off` to `interactive` would be a breach.
 */
export function parsePtyMode(value: string | undefined): PtyMode {
  const raw = value?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "false" || raw === "off" || raw === "no") return "off";
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "read-only" || raw === "readonly") {
    return "read-only";
  }
  if (raw === "interactive") return "interactive";
  throw new PtyConfigError(
    "PTY_ENABLED must be one of: off, read-only, interactive (unset means off)",
  );
}

/** Creating a PTY is arbitrary code execution; only interactive may do it. */
export function ptyAllowsCreate(mode: PtyMode): boolean {
  return mode === "interactive";
}

/** Writing to a PTY is arbitrary code execution; only interactive may do it. */
export function ptyAllowsInput(mode: PtyMode): boolean {
  return mode === "interactive";
}

/**
 * Killing is allowed in read-only mode on purpose. Cancelling a runaway process
 * is the whole point of issue #58's "safe surface for long-running work", and
 * terminating a process is not code execution — it strictly reduces what is
 * running on the host.
 */
export function ptyAllowsKill(mode: PtyMode): boolean {
  return mode !== "off";
}

/**
 * Retitling and resizing mutate state shared by every attached viewer, and a
 * resize is observable by the running process (SIGWINCH). Read-only means
 * read-only.
 */
export function ptyAllowsUpdate(mode: PtyMode): boolean {
  return mode === "interactive";
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PtyConfigError("PTY_ALLOWED_ORIGINS entries must use http or https");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new PtyConfigError(
      "PTY_ALLOWED_ORIGINS entries must be bare origins without credentials, a path, query, or fragment",
    );
  }
  return url.origin;
}

export function parsePtyAllowedOrigins(value: string | undefined): string[] {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const origins = new Set<string>();
  for (const entry of entries) {
    try {
      origins.add(normalizeOrigin(entry));
    } catch (error) {
      if (error instanceof PtyConfigError) throw error;
      throw new PtyConfigError(`PTY_ALLOWED_ORIGINS entry ${JSON.stringify(entry)} is not a valid origin`);
    }
  }
  return [...origins];
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;

/**
 * Build the handshake allowlist.
 *
 * PUBLIC_APP_URL is the one origin the operator has already declared as this
 * app's public identity, so it is the anchor. Loopback is added only on the
 * ports this app actually serves (the BFF, and the Vite dev server during
 * development) — not on every loopback port. "Anything on localhost is already
 * trusted" is false here: a dev server rendering a third-party project's
 * frontend is attacker-influenced content served from localhost, and blanket
 * loopback would hand it a shell.
 *
 * The Host header is deliberately NOT consulted. Deriving the allowlist from
 * the request would accept whatever a DNS-rebinding attacker resolved to us,
 * which is precisely the attack the 0.0.0.0 bind leaves open.
 */
export function ptyOriginAllowlist(options: {
  publicAppUrl: string | null;
  extra?: readonly string[];
  loopbackPorts?: readonly number[];
}): string[] {
  const origins = new Set<string>();
  if (options.publicAppUrl) origins.add(options.publicAppUrl);
  for (const origin of options.extra ?? []) origins.add(origin);
  for (const port of options.loopbackPorts ?? []) {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) continue;
    for (const host of LOOPBACK_HOSTS) origins.add(`http://${host}:${port}`);
  }
  return [...origins];
}

/**
 * A handshake with no Origin header is rejected.
 *
 * Every browser sends Origin on a WebSocket handshake, so the only clients this
 * turns away are non-browser ones — which can set the header explicitly if they
 * mean to. Accepting the absent case would make the whole check opt-out, which
 * is the same as not having it.
 */
export function isAllowedPtyOrigin(origin: string | undefined, allowlist: readonly string[]): boolean {
  if (typeof origin !== "string" || !origin) return false;
  // A sandboxed iframe or a redirected form post serialises its origin as the
  // literal string "null"; URL() would reject it anyway, but say so explicitly.
  if (origin === "null") return false;
  let candidate: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    candidate = url.origin;
  } catch {
    return false;
  }
  // Compare canonical origins, so "http://host:80" and "http://host" match and
  // "https://evil.test/path" cannot smuggle itself past a string compare.
  return allowlist.some((allowed) => {
    try {
      return new URL(allowed).origin === candidate;
    } catch {
      return false;
    }
  });
}
