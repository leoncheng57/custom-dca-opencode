import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { Context } from "@deepseek-ai/cordis";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";

/**
 * Read-only view over DeepSeek Harness's own durable session log.
 *
 * DCA already owns the root: the bridge passes `session_root` to the SDK,
 * which exports it as `DSH_SESSION_ROOT`, and the stock runtime composition
 * resolves the JSONL backend's `root` from that variable. The seatbelt profile
 * only grants writes under the same state directory, so a composition that
 * persists at all persists here.
 *
 * Three rules make this safe to point at a log another process is writing:
 *
 * 1. Only `list`, `listSnapshots`, `locate` and `readFrom` are ever called.
 *    `load` and `prepare` perform cold recovery that DURABLY REWRITES the
 *    harness's own log — closing interrupted turns and inserting synthetic
 *    tool errors. A read model must never do that, so they are not exposed
 *    here at all rather than left available to a future caller.
 * 2. `readFrom` is a detached physical suffix read: it returns only the valid
 *    contiguous stored prefix, so a half-written tail is never returned, and a
 *    watermark at or past the end yields an empty list rather than an error.
 * 3. The backend is constructed against the encoding actually on disk. A
 *    mismatched `compression` makes every read throw rather than misparse, so
 *    the encoding is detected from the artifact filename instead of assumed.
 */

/** Persistence is optional, so every failure mode is a named absence. */
export type DurableAvailability =
  | { available: true; root: string; compression: "zstd" | "none" }
  | { available: false; reason: "no-root" | "no-artifacts" | "unreadable" };

export interface DurableEvent {
  seq: number;
  type: string;
  time?: number;
  data?: unknown;
  ignorable?: boolean;
  sourceEventSeqs?: number[];
  surfaceOp?: string;
}

interface Backend {
  list(signal?: AbortSignal): Promise<Array<{ id: string }>>;
  listSnapshots(signal?: AbortSignal): Promise<Array<{ header: { id: string }; revision: string }>>;
  readFrom(id: string, fromSeq: number, signal?: AbortSignal): Promise<{ events: DurableEvent[] }>;
}

const ARTIFACT_ZSTD = "session.jsonl.zstd";
const ARTIFACT_PLAIN = "session.jsonl";
/** Bounded probe: the root holds one directory per workspace, then per session. */
const MAX_PROBE_ENTRIES = 200;

function directories(root: string, limit: number): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .slice(0, limit)
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

/**
 * Detect the on-disk encoding by finding one session artifact. The filename is
 * authoritative; the operator's cordis file is not parsed, because it may use
 * `!!js` expressions that only the runtime can evaluate.
 */
export function detectDurable(root: string | undefined): DurableAvailability {
  if (!root || !existsSync(root)) return { available: false, reason: "no-root" };
  try {
    if (!statSync(root).isDirectory()) return { available: false, reason: "no-root" };
    for (const workspace of directories(root, MAX_PROBE_ENTRIES)) {
      for (const session of directories(workspace, MAX_PROBE_ENTRIES)) {
        if (existsSync(path.join(session, ARTIFACT_ZSTD))) return { available: true, root, compression: "zstd" };
        if (existsSync(path.join(session, ARTIFACT_PLAIN))) return { available: true, root, compression: "none" };
      }
    }
    return { available: false, reason: "no-artifacts" };
  } catch {
    return { available: false, reason: "unreadable" };
  }
}

/**
 * Construct the vendor backend as a reader.
 *
 * The coordinator's constructor unconditionally installs a write path and
 * dereferences `ctx.sessions`, so a stub is required to build one at all. The
 * stub deliberately cannot produce a session: `list` is empty, so the write
 * path adopts nothing, and `prepare` throws if anything ever reaches for it.
 * Nothing in this process emits `session/event`, so the installed listeners
 * stay idle.
 */
function createBackend(root: string, compression: "zstd" | "none"): Backend {
  const ctx = new Context();
  ctx.provide("sessions", {
    list: () => [],
    prepare: () => { throw new Error("DCA durable trajectory is read-only"); },
  });
  ctx.provide("logger", { warn() {}, info() {}, debug() {} });
  return new JsonlSessionPersistence(ctx, { root, compression }) as unknown as Backend;
}

/** While unavailable, re-probe at most this often; a fresh install has no artifacts yet. */
const REPROBE_MS = 30_000;

export class DshDurableReader {
  private backend: Backend | null = null;
  private availability: DurableAvailability = { available: false, reason: "no-root" };
  private probedAt = 0;

  constructor(private readonly root: string | undefined) {}

  /**
   * Detection is lazy and re-probed while unavailable: the first session on a
   * fresh install materializes the very artifacts this looks for, so a
   * once-at-boot probe would strand the deployment in capture mode until
   * someone restarted it. Once available it is sticky — the encoding of an
   * existing log does not change underneath us.
   */
  private resolveAvailability(): DurableAvailability {
    if (this.availability.available) return this.availability;
    const now = Date.now();
    if (this.probedAt !== 0 && now - this.probedAt < REPROBE_MS) return this.availability;
    this.probedAt = now;
    this.availability = detectDurable(this.root);
    return this.availability;
  }

  get enabled(): boolean {
    return this.resolveAvailability().available;
  }

  private get(): Backend | null {
    const availability = this.resolveAvailability();
    if (!availability.available) return null;
    if (!this.backend) this.backend = createBackend(availability.root, availability.compression);
    return this.backend;
  }

  /**
   * Cheap change token for one session, so a projection can skip a reread when
   * nothing was appended. Absent when the session is not persisted here.
   */
  async revision(sessionId: string, signal?: AbortSignal): Promise<string | undefined> {
    const backend = this.get();
    if (!backend) return undefined;
    try {
      const snapshots = await backend.listSnapshots(signal);
      return snapshots.find((item) => item.header.id === sessionId)?.revision;
    } catch {
      return undefined;
    }
  }

  /**
   * Stored events from `fromSeq` onward. Returns `undefined` — never an empty
   * array — when the durable log cannot answer, so a caller can tell "nothing
   * new" from "not available" and fall back instead of reporting a complete
   * but empty trajectory.
   */
  async readFrom(sessionId: string, fromSeq: number, signal?: AbortSignal): Promise<DurableEvent[] | undefined> {
    const backend = this.get();
    if (!backend) return undefined;
    try {
      const result = await backend.readFrom(sessionId, Math.max(0, Math.floor(fromSeq)), signal);
      return result.events;
    } catch {
      return undefined;
    }
  }
}
