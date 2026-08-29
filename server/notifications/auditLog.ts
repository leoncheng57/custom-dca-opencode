/**
 * Durable, size- and age-bounded persistence for notification audit lines.
 *
 * Why this file exists at all: `logAuditEvent` used to `console.log` its JSON
 * line, which launchd captured into `.state/logs/bff.launchd.out.log`. That
 * file has no rotation — the same failure already recorded for the OpenCode
 * server in `deploy/ai.opencode.serve.plist` ("It reached 117 MB on the
 * author's machine") — and measurement showed 83% of its lines were audit
 * JSON. Moving those lines into a file this process owns bounds the audit log
 * directly AND collapses the launchd log to boot noise, without rotating a
 * file whose descriptor belongs to launchd.
 *
 * That last point is the whole design. Renaming or replacing a launchd-owned
 * log orphans its open descriptor and writes vanish silently; copy-truncate
 * only works if launchd opened with O_APPEND, which is not a property worth
 * betting the logging subsystem on. Owning the file sidesteps the question.
 *
 * Retention mirrors the two precedents already in this repository:
 * `dsh/trajectory.ts` (trim-on-append against byte and age budgets) and
 * `notifications/history.ts` (drop oldest past a cap). It is deliberately not
 * `pino` + `pino-roll`: rotation would need a new runtime dependency, and
 * AGENTS.md requires a recorded reason for one when local patterns suffice.
 *
 * Failure is always swallowed. Losing audit history must never block the
 * notification path that produced the event.
 */

import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** 8 MiB is ~14 months at the observed ~131 KB/week of audit traffic. */
export const AUDIT_LOG_MAX_BYTES = 8 * 1024 * 1024;
export const AUDIT_LOG_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/**
 * Trim to a fraction of the cap rather than exactly to it, so a file sitting
 * at the boundary does not rewrite itself on every single append.
 */
const TRIM_TARGET_RATIO = 0.75;
/**
 * Stat only after this much has accumulated; appends must stay cheap.
 *
 * This is an upper bound, not the value used. The interval must never exceed
 * the byte budget it is protecting, or the budget is simply unenforceable —
 * the file grows to the interval before anything checks. `statInterval`
 * derives the effective value per instance.
 */
const MAX_STAT_INTERVAL_BYTES = 256 * 1024;
const MIN_STAT_INTERVAL_BYTES = 1024;
/** An age sweep needs a full read, so it runs at most this often. */
const AGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export interface AuditLogLimits {
  maxBytes: number;
  maxAgeMs: number;
}

const DEFAULT_LIMITS: AuditLogLimits = {
  maxBytes: AUDIT_LOG_MAX_BYTES,
  maxAgeMs: AUDIT_LOG_MAX_AGE_MS,
};

/** `LOG_DIR` keeps this resolvable from tests and from `scripts/launchd.ts`. */
export function auditLogDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return env.LOG_DIR || path.resolve(process.cwd(), ".state/logs");
}

export function auditLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUDIT_LOG_FILE || path.join(auditLogDirectory(env), "audit.jsonl");
}

/**
 * Serialized appender for one JSONL file.
 *
 * `append` is deliberately synchronous-looking and returns void: callers are
 * on the notification hot path and must not await disk. Work is chained onto
 * an internal queue; `flush` exists so tests can await it.
 */
export class AuditLogWriter {
  private queue: Promise<void> = Promise.resolve();
  private bytesSinceStat = 0;
  private lastAgeSweep = Date.now();
  private writeCounter = 0;
  private readonly statInterval: number;

  constructor(
    readonly file: string = auditLogPath(),
    private readonly limits: AuditLogLimits = DEFAULT_LIMITS,
  ) {
    // Quarter of the budget keeps the overshoot bounded at ~25% while leaving
    // the production case (8 MiB) on the cheap 256 KB interval.
    this.statInterval = Math.min(
      MAX_STAT_INTERVAL_BYTES,
      Math.max(MIN_STAT_INTERVAL_BYTES, Math.floor(limits.maxBytes / 4)),
    );
  }

  append(line: string): void {
    const payload = `${line}\n`;
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        await appendFile(this.file, payload, { mode: 0o600 });
        this.bytesSinceStat += Buffer.byteLength(payload, "utf8");
        await this.maybeTrim();
      })
      .catch((error: unknown) => {
        console.warn("[audit-log]", error instanceof Error ? error.message : String(error));
      });
  }

  /** Tests only. Production callers fire and forget. */
  flush(): Promise<void> {
    return this.queue;
  }

  private async maybeTrim(): Promise<void> {
    const ageSweepDue = Date.now() - this.lastAgeSweep >= AGE_SWEEP_INTERVAL_MS;
    if (this.bytesSinceStat < this.statInterval && !ageSweepDue) return;
    this.bytesSinceStat = 0;

    const info = await stat(this.file).catch(() => null);
    if (!info) return;
    if (info.size <= this.limits.maxBytes && !ageSweepDue) return;
    this.lastAgeSweep = Date.now();

    const raw = await readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return;
    const kept = this.retain(raw.split("\n").filter(Boolean));

    // Rewrite atomically. A crash mid-trim must not leave a half-written log.
    const temporary = `${this.file}.${process.pid}.${(this.writeCounter += 1)}.tmp`;
    try {
      await writeFile(temporary, kept.length ? `${kept.join("\n")}\n` : "", { mode: 0o600 });
      await rename(temporary, this.file);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Age first, then size from the head.
   *
   * Lines that do not parse are KEPT rather than dropped: this file is only
   * ever written by this process, so an unparseable line is corruption, and
   * silently deleting the evidence of corruption is the wrong default. They
   * remain subject to the size bound.
   */
  private retain(lines: string[]): string[] {
    const cutoff = Date.now() - this.limits.maxAgeMs;
    let kept = lines.filter((line) => {
      const ts = lineTimestamp(line);
      return ts === null || ts >= cutoff;
    });

    let bytes = kept.reduce((total, line) => total + Buffer.byteLength(line, "utf8") + 1, 0);
    if (bytes <= this.limits.maxBytes) return kept;

    const target = Math.floor(this.limits.maxBytes * TRIM_TARGET_RATIO);
    let index = 0;
    while (index < kept.length && bytes > target) {
      bytes -= Buffer.byteLength(kept[index], "utf8") + 1;
      index += 1;
    }
    kept = kept.slice(index);
    return kept;
  }
}

function lineTimestamp(line: string): number | null {
  try {
    const parsed: unknown = JSON.parse(line);
    const ts = (parsed as { ts?: unknown })?.ts;
    if (typeof ts !== "string") return null;
    const value = Date.parse(ts);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

let writer: AuditLogWriter | null = null;

/** Lazy so `LOG_DIR` / `AUDIT_LOG_FILE` can be set before the first event. */
export function auditLogWriter(): AuditLogWriter {
  writer ??= new AuditLogWriter();
  return writer;
}

/** Tests only; the module-level writer would otherwise leak between cases. */
export function setAuditLogWriter(next: AuditLogWriter | null): void {
  writer = next;
}
