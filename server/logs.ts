/**
 * Bounded reads of this host's BFF log files, for the /observability page.
 *
 * Three constraints shape everything here.
 *
 * 1. The browser never names a path. `requireReadableWorkspacePath`
 *    (`server/paths.ts`) is scoped to PROJECTS_DIR and the worktree root and
 *    its sensitive-segment pattern does not cover `.state`, so it does not
 *    apply to log files. Rather than widen it, this module follows the
 *    `server/github-planning.ts` posture: the caller picks from a fixed enum
 *    and the paths are resolved server-side.
 *
 * 2. Reads are bounded. `bff.launchd.out.log` has no rotation and was 928 KB
 *    on the reference host; loading it whole on every poll is not acceptable.
 *    A `stat().size` gate reads only the trailing window.
 *
 * 3. The three files have genuinely different shapes, measured rather than
 *    assumed. `audit.jsonl` is pure JSONL. `bff.launchd.out.log` is mostly
 *    boot noise now that audit lines moved out. `bff.launchd.err.log` has no
 *    JSON at all and is ~55% stack-trace continuations, which is why frames
 *    are folded into the header line that owns them instead of becoming
 *    hundreds of orphan rows.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { auditLogDirectory, auditLogPath } from "./notifications/auditLog.js";

export const LOG_LIMITS = {
  /** Trailing window read from disk. Enough for the line cap on real files. */
  tailBytes: 512 * 1024,
  /** Hard cap on rows returned, applied after grouping. */
  maxEntries: 500,
  /** A single line longer than this is truncated rather than shipped whole. */
  maxLineChars: 4_000,
  /** Stack frames kept per grouped trace. */
  maxFrames: 40,
  cacheMs: 3_000,
} as const;

export const LOG_SOURCES = ["audit", "stdout", "stderr"] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export function isLogSource(value: unknown): value is LogSource {
  return typeof value === "string" && (LOG_SOURCES as readonly string[]).includes(value);
}

/** Fixed, server-resolved paths. Never influenced by request input. */
export function logSourcePath(source: LogSource, env: NodeJS.ProcessEnv = process.env): string {
  if (source === "audit") return auditLogPath(env);
  const directory = auditLogDirectory(env);
  return path.join(directory, source === "stdout" ? "bff.launchd.out.log" : "bff.launchd.err.log");
}

export interface AuditLogEntry {
  kind: "audit";
  /** Stable within a response; index-based because lines carry no id. */
  id: string;
  ts: string;
  event: string;
  fields: Array<{ key: string; value: string }>;
}

export interface TextLogEntry {
  kind: "text";
  id: string;
  /** Present only when the line begins with a recognised `[prefix]`. */
  prefix?: string;
  text: string;
  /** Folded stack-trace continuations belonging to this line. */
  frames?: string[];
  framesTruncated?: boolean;
  severity: "error" | "warn" | "info";
}

export type LogEntry = AuditLogEntry | TextLogEntry;

export interface LogSnapshot {
  source: LogSource;
  /** Absolute path, so the page can tell the operator where to look. */
  file: string;
  exists: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
  entries: LogEntry[];
  /** True when the byte window or the entry cap dropped older content. */
  truncated: boolean;
  readAt: string;
}

const PREFIX = /^\[([a-z][a-z0-9-]*)\]\s?/iu;
const FRAME = /^\s+at\s/u;
const ERROR_HEADER = /^[A-Z][A-Za-z0-9_]*(Error|Exception):/u;

function truncate(value: string): string {
  return value.length > LOG_LIMITS.maxLineChars
    ? `${value.slice(0, LOG_LIMITS.maxLineChars)}…`
    : value;
}

/**
 * Payload rendering is intentionally shallow. Audit payloads are flat by
 * construction (`server/notifications/audit.ts`), and a generic deep walker
 * would be an invitation to render arbitrary nested content the page has made
 * no promises about.
 */
function auditFields(payload: unknown): Array<{ key: string; value: string }> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({
      key,
      value: truncate(typeof value === "object" ? JSON.stringify(value) : String(value)),
    }));
}

function severityOf(text: string, source: LogSource): TextLogEntry["severity"] {
  if (ERROR_HEADER.test(text)) return "error";
  if (source === "stderr") return "warn";
  return "info";
}

/**
 * Parse newest-last lines into rows, folding `at ...` frames into the line
 * above them. Malformed JSON on the audit source degrades to a text row rather
 * than being dropped: a line we cannot parse is the most interesting kind.
 */
export function parseLogLines(lines: string[], source: LogSource): LogEntry[] {
  const entries: LogEntry[] = [];
  let index = 0;

  for (const raw of lines) {
    if (!raw) continue;

    if (FRAME.test(raw) && entries.length > 0) {
      const previous = entries[entries.length - 1];
      if (previous.kind === "text") {
        previous.frames ??= [];
        if (previous.frames.length < LOG_LIMITS.maxFrames) previous.frames.push(truncate(raw.trim()));
        else previous.framesTruncated = true;
        continue;
      }
    }

    const id = `${source}-${index++}`;
    const trimmed = raw.trimEnd();

    if (trimmed.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        const record = parsed as { ts?: unknown; audit?: unknown; event?: unknown; payload?: unknown };
        if (record.audit === "notification" && typeof record.event === "string" && typeof record.ts === "string") {
          entries.push({ kind: "audit", id, ts: record.ts, event: record.event, fields: auditFields(record.payload) });
          continue;
        }
      } catch {
        // Falls through to the text row below on purpose.
      }
    }

    const prefixMatch = PREFIX.exec(trimmed);
    entries.push({
      kind: "text",
      id,
      prefix: prefixMatch?.[1],
      text: truncate(prefixMatch ? trimmed.slice(prefixMatch[0].length) : trimmed),
      severity: severityOf(trimmed, source),
    });
  }

  return entries;
}

async function loadSnapshot(source: LogSource): Promise<LogSnapshot> {
  const file = logSourcePath(source);
  const readAt = new Date().toISOString();
  const info = await stat(file).catch(() => null);

  if (!info) {
    return { source, file, exists: false, sizeBytes: 0, modifiedAt: null, entries: [], truncated: false, readAt };
  }

  // Read only the trailing window. The first line of that window is usually a
  // fragment, so it is dropped when the file is larger than the window.
  const windowed = info.size > LOG_LIMITS.tailBytes;
  const handle = await readFile(file, "utf8").catch(() => "");
  const text = windowed ? handle.slice(handle.length - LOG_LIMITS.tailBytes) : handle;
  const lines = text.split("\n");
  if (windowed && lines.length > 1) lines.shift();

  const parsed = parseLogLines(lines, source);
  const overCap = parsed.length > LOG_LIMITS.maxEntries;
  return {
    source,
    file,
    exists: true,
    sizeBytes: info.size,
    modifiedAt: info.mtime.toISOString(),
    entries: overCap ? parsed.slice(parsed.length - LOG_LIMITS.maxEntries) : parsed,
    truncated: windowed || overCap,
    readAt,
  };
}

const cache = new Map<LogSource, { snapshot: LogSnapshot; expiresAt: number }>();
let inFlight = new Map<LogSource, Promise<LogSnapshot>>();

/** Tests only; a module-level cache would otherwise leak between cases. */
export function resetLogCache(): void {
  cache.clear();
  inFlight = new Map();
}

/**
 * Cached briefly and coalesced while in flight: follow mode polls, and several
 * open tabs must not multiply into several full-window reads of an unrotated
 * log on every tick.
 */
export function getLogSnapshot(source: LogSource, refresh = false): Promise<LogSnapshot> {
  const cached = cache.get(source);
  if (!refresh && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.snapshot);
  const pending = inFlight.get(source);
  if (pending) return pending;

  const request = loadSnapshot(source)
    .then((snapshot) => {
      cache.set(source, { snapshot, expiresAt: Date.now() + LOG_LIMITS.cacheMs });
      return snapshot;
    })
    .finally(() => {
      if (inFlight.get(source) === request) inFlight.delete(source);
    });
  inFlight.set(source, request);
  return request;
}
