// server/opencode/capabilities.ts
//
// `GET /experimental/capabilities` tells us what the *running* server can do.
// Two properties make it worth a module of its own:
//
//   1. It is experimental, so it may be absent, renamed or reshaped. Every
//      failure here degrades to "capability off" rather than breaking a page —
//      a missing probe must never make the UI claim a feature exists.
//   2. It is the honest gate for background-subagent controls. The alternative
//      (assuming a feature from an environment variable the BFF cannot read,
//      because OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS is set on the agent
//      process, not on us) would show buttons that silently do nothing.
//
// Results are cached briefly per directory: capability flags change only when
// the agent server restarts, but the subagent panel polls, and one upstream
// round trip per poll per directory is pure waste.

import { request, type OpencodeConfig } from "./client.js";

export interface Capabilities {
  /** `POST /experimental/session/{id}/background` is usable. */
  backgroundSubagents: boolean;
  /** Direct child creation contract validated for OpenCode V1.18.22+. */
  managedChildren: boolean;
}

export const CAPABILITIES_TTL_MS = 30_000;

const NONE: Capabilities = { backgroundSubagents: false, managedChildren: false };

interface CacheEntry {
  at: number;
  value: Capabilities;
}

const cache = new Map<string, CacheEntry>();

/** Exposed for tests; production callers never need to reset the cache. */
export function resetCapabilitiesCache(): void {
  cache.clear();
}

export function parseCapabilities(value: unknown): Capabilities {
  if (!value || typeof value !== "object" || Array.isArray(value)) return NONE;
  const source = value as Record<string, unknown>;
  return { backgroundSubagents: source.backgroundSubagents === true, managedChildren: false };
}

export function supportsManagedChildren(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const version = (value as Record<string, unknown>).version;
  if (typeof version !== "string") return false;
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 1 && (minor > 18 || (minor === 18 && patch >= 22));
}

/**
 * Capability flags for one project, or all-false when the probe is unavailable.
 *
 * Never throws. A capability probe that fails is indistinguishable, from the
 * UI's point of view, from a capability that is switched off — and treating it
 * as "off" is the only safe direction to be wrong in.
 */
export async function getCapabilities(
  config: OpencodeConfig,
  directory: string,
  now = Date.now(),
): Promise<Capabilities> {
  const cached = cache.get(directory);
  if (cached && now - cached.at < CAPABILITIES_TTL_MS) return cached.value;

  const [experimental, health] = await Promise.all([
    request<unknown>(config, "/experimental/capabilities", { directory })
      .then(parseCapabilities)
      .catch(() => NONE),
    request<unknown>(config, "/global/health").catch(() => null),
  ]);
  const value = { ...experimental, managedChildren: supportsManagedChildren(health) };
  cache.set(directory, { at: now, value });
  return value;
}
