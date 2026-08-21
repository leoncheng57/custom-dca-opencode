// server/notifications/history.ts
//
// Durable log of every notification the BFF classified, plus the derived
// "active" set that drives the red badge in the UI.
//
// Why this exists at all: notifications used to be fire-and-forget. The
// service classified an event, pushed ntfy, and forgot it. A badge counting
// outstanding work and a history log are two views over the same record, so
// the record has to be written somewhere both can read.
//
// Two properties that are easy to get wrong:
//   - `delivery.browser` records the *preference*, not a delivery. The BFF
//     cannot observe whether a browser tab was open, so claiming delivery
//     would be a lie. The UI says "allowed", never "delivered".
//   - Only `permission` and `question` records are `actionable`. Those are the
//     only kinds a human can clear by replying, so they are the only kinds
//     that may hold the badge above zero.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { NOTIFY_EVENTS, type NotifyEvent } from "./preferences.js";

/** Kinds a human clears by replying; the only ones that can hold the badge. */
export const ACTIONABLE_EVENTS: readonly NotifyEvent[] = ["permission", "question"];

export type NtfyDelivery = "sent" | "off" | "failed";
/** "allowed" is preference intent. The BFF cannot confirm a browser rendered it. */
export type BrowserDelivery = "allowed" | "off";
export type ResolutionReason = "replied" | "reconciled" | "dismissed" | "stale" | "suppressed";

export interface NotificationDelivery {
  ntfy: NtfyDelivery;
  ntfyError?: string;
  browser: BrowserDelivery;
  suppressed?: "auto-permissions";
}

export interface NotificationRecord {
  id: string;
  kind: NotifyEvent;
  at: number;
  directory?: string;
  sessionID?: string;
  /** Permission/question request id — the key resolution matches on. */
  requestID?: string;
  title: string;
  body: string;
  click?: string;
  actionable: boolean;
  resolvedAt?: number;
  resolvedBy?: ResolutionReason;
  /** Set on the parent permission record when its parked alert fires. */
  parkedAt?: number;
  delivery: NotificationDelivery;
}

export interface AppendRecord {
  kind: NotifyEvent;
  directory?: string;
  sessionID?: string;
  requestID?: string;
  title: string;
  body: string;
  click?: string;
  delivery: NotificationDelivery;
  /** Force a record closed at birth (auto-approved permissions). */
  resolvedBy?: ResolutionReason;
}

export interface HistoryQuery {
  limit?: number;
  kind?: NotifyEvent;
  directory?: string;
  state?: "all" | "active" | "resolved";
}

export const HISTORY_LIMIT = 500;
const MAX_PAGE = 200;
/** An actionable record this old can never be reconciled; retire it. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function isNotifyEvent(value: unknown): value is NotifyEvent {
  return typeof value === "string" && (NOTIFY_EVENTS as readonly string[]).includes(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function normalizeDelivery(value: unknown): NotificationDelivery {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ntfy: NtfyDelivery =
    source.ntfy === "sent" || source.ntfy === "failed" ? source.ntfy : "off";
  return {
    ntfy,
    ...(optionalString(source.ntfyError) ? { ntfyError: String(source.ntfyError) } : {}),
    browser: source.browser === "allowed" ? "allowed" : "off",
    ...(source.suppressed === "auto-permissions" ? { suppressed: "auto-permissions" as const } : {}),
  };
}

/**
 * Rebuild a record from disk. Anything unparseable is dropped rather than
 * thrown: a corrupt line must not take the notification pipeline down with it.
 */
function normalizeRecord(value: unknown): NotificationRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!isNotifyEvent(source.kind)) return null;
  const at = Number(source.at);
  if (!Number.isFinite(at)) return null;
  const resolvedAt = Number(source.resolvedAt);
  const parkedAt = Number(source.parkedAt);
  return {
    id: optionalString(source.id) ?? randomUUID(),
    kind: source.kind,
    at,
    ...(optionalString(source.directory) ? { directory: String(source.directory) } : {}),
    ...(optionalString(source.sessionID) ? { sessionID: String(source.sessionID) } : {}),
    ...(optionalString(source.requestID) ? { requestID: String(source.requestID) } : {}),
    title: typeof source.title === "string" ? source.title : "",
    body: typeof source.body === "string" ? source.body : "",
    ...(optionalString(source.click) ? { click: String(source.click) } : {}),
    actionable: source.actionable === true,
    ...(Number.isFinite(resolvedAt) ? { resolvedAt } : {}),
    ...(optionalString(source.resolvedBy) ? { resolvedBy: source.resolvedBy as ResolutionReason } : {}),
    ...(Number.isFinite(parkedAt) ? { parkedAt } : {}),
    delivery: normalizeDelivery(source.delivery),
  };
}

export function isActive(record: NotificationRecord): boolean {
  return record.actionable && record.resolvedAt === undefined;
}

/**
 * Append-only ring buffer of notification records.
 *
 * Reads are served from memory; the file is a durability tail. Writes are
 * serialized through a promise chain because several events can land in the
 * same tick and an interleaved temp file would corrupt the log.
 */
export class HistoryStore {
  private records: NotificationRecord[] = [];
  private loaded: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private writeCounter = 0;

  constructor(
    readonly file = process.env.NOTIFICATION_HISTORY_FILE ||
      path.resolve(process.cwd(), ".state/notification-history.json"),
    private readonly limit = HISTORY_LIMIT,
  ) {}

  /** Idempotent; every public method funnels through this before touching state. */
  private load(): Promise<void> {
    this.loaded ??= readFile(this.file, "utf8")
      .then((raw) => {
        const parsed: unknown = JSON.parse(raw);
        const source = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as Record<string, unknown>)?.records)
            ? ((parsed as Record<string, unknown>).records as unknown[])
            : [];
        this.records = source
          .map(normalizeRecord)
          .filter((record): record is NotificationRecord => record !== null)
          .slice(-this.limit);
      })
      .catch(() => {
        // Missing or malformed history starts empty rather than failing the
        // notification path. Losing the log is survivable; dropping alerts is not.
        this.records = [];
      });
    return this.loaded;
  }

  private persist(): void {
    const snapshot = this.records.slice();
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${process.pid}.${(this.writeCounter += 1)}.tmp`;
        await writeFile(temporary, `${JSON.stringify({ version: 1, records: snapshot }, null, 2)}\n`, {
          mode: 0o600,
        });
        await rename(temporary, this.file);
      })
      .catch((error: unknown) => {
        console.warn("[notification-history]", error instanceof Error ? error.message : String(error));
      });
  }

  /** Resolves once every queued write has drained. Tests and shutdown use this. */
  flush(): Promise<void> {
    return this.queue;
  }

  async append(entry: AppendRecord): Promise<NotificationRecord> {
    await this.load();
    const now = Date.now();
    const record: NotificationRecord = {
      id: randomUUID(),
      kind: entry.kind,
      at: now,
      ...(entry.directory ? { directory: entry.directory } : {}),
      ...(entry.sessionID ? { sessionID: entry.sessionID } : {}),
      ...(entry.requestID ? { requestID: entry.requestID } : {}),
      title: entry.title,
      body: entry.body,
      ...(entry.click ? { click: entry.click } : {}),
      actionable: ACTIONABLE_EVENTS.includes(entry.kind) && entry.resolvedBy === undefined,
      ...(entry.resolvedBy ? { resolvedAt: now, resolvedBy: entry.resolvedBy } : {}),
      delivery: entry.delivery,
    };
    this.records.push(record);
    if (this.records.length > this.limit) this.records.splice(0, this.records.length - this.limit);
    this.persist();
    return record;
  }

  /** Close every active record the predicate selects. Returns how many changed. */
  async resolve(
    predicate: (record: NotificationRecord) => boolean,
    reason: ResolutionReason,
    at = Date.now(),
  ): Promise<number> {
    await this.load();
    let changed = 0;
    for (const record of this.records) {
      if (!isActive(record) || !predicate(record)) continue;
      record.resolvedAt = at;
      record.resolvedBy = reason;
      changed += 1;
    }
    if (changed) this.persist();
    return changed;
  }

  /** Stamp the escalation onto the parent permission so the UI can flag it. */
  async markParked(directory: string | undefined, requestID: string, at = Date.now()): Promise<boolean> {
    await this.load();
    const parent = this.records.find(
      (record) =>
        record.kind === "permission" &&
        record.requestID === requestID &&
        record.directory === directory &&
        isActive(record),
    );
    if (!parent) return false;
    parent.parkedAt = at;
    this.persist();
    return true;
  }

  /** Retire actionable records too old to ever be reconciled. */
  async expireStale(now = Date.now(), maxAge = STALE_AFTER_MS): Promise<number> {
    return this.resolve((record) => now - record.at > maxAge, "stale", now);
  }

  async activeCount(): Promise<number> {
    await this.load();
    return this.records.reduce((total, record) => total + (isActive(record) ? 1 : 0), 0);
  }

  /** Directories holding at least one active record — the reconcile work list. */
  async activeDirectories(): Promise<string[]> {
    await this.load();
    return [
      ...new Set(
        this.records
          .filter((record) => isActive(record) && record.directory)
          .map((record) => record.directory as string),
      ),
    ];
  }

  async list(query: HistoryQuery = {}): Promise<NotificationRecord[]> {
    await this.load();
    const limit = Math.max(1, Math.min(MAX_PAGE, Math.trunc(query.limit ?? 100) || 100));
    const state = query.state ?? "all";
    return this.records
      .filter((record) => {
        if (query.kind && record.kind !== query.kind) return false;
        if (query.directory && record.directory !== query.directory) return false;
        if (state === "active") return isActive(record);
        if (state === "resolved") return !isActive(record);
        return true;
      })
      .slice(-limit)
      .reverse();
  }

  async find(id: string): Promise<NotificationRecord | undefined> {
    await this.load();
    return this.records.find((record) => record.id === id);
  }

  /**
   * Drop resolved records only. Clearing actives would be unrecoverable —
   * reconciliation can close a record but never recreate one.
   */
  async clearResolved(): Promise<number> {
    await this.load();
    const before = this.records.length;
    this.records = this.records.filter(isActive);
    const removed = before - this.records.length;
    if (removed) this.persist();
    return removed;
  }
}
