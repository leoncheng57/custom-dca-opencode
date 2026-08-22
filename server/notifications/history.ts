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
//   - `delivery.desktop` records the *preference*, not a delivery. The BFF
//     cannot observe whether a browser tab was open, so claiming delivery
//     would be a lie. Sound and speech are device-local and intentionally not
//     represented here because the server cannot see those settings at all.
//   - Every record starts unresolved and only an explicit user checkbox may
//     change that state. Upstream permission/question lifecycle events never
//     mutate notification resolution.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { NOTIFY_EVENTS, type NotifyEvent } from "./preferences.js";

export type NtfyDelivery = "sent" | "off" | "failed";
/** "allowed" is preference intent. The BFF cannot confirm a browser rendered it. */
export type DesktopDelivery = "allowed" | "off";
// Older reasons remain readable because v1 records are already persisted on
// deployed servers. New writes use only "checked".
export type ResolutionReason = "checked" | "replied" | "reconciled" | "dismissed" | "suppressed";

/**
 * Why nothing was sent for a record — and, because a suppressed record is by
 * definition one the user was never pinged about, also the axis the UI filters
 * on. Both categories are noise by default:
 *   - "auto-permissions": the request was preapproved, so there was never a
 *     decision to make.
 *   - "subagent": a delegated child session, whose lifecycle is the parent's
 *     business, not the user's inbox.
 * One field rather than a separate origin marker, because today these are
 * exactly the records that are recorded-but-not-delivered. If sub-agent
 * notifications ever become deliverable, split origin out then.
 */
export const SUPPRESSION_REASONS = ["auto-permissions", "subagent"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export interface NotificationDelivery {
  ntfy: NtfyDelivery;
  ntfyError?: string;
  desktop: DesktopDelivery;
  suppressed?: SuppressionReason;
}

export interface NotificationRecord {
  id: string;
  kind: NotifyEvent;
  at: number;
  directory?: string;
  sessionID?: string;
  /**
   * Session title as it stood when the notification fired. Snapshotted rather
   * than resolved on read: sessions get renamed and deleted, and a record must
   * still say which piece of work it came from.
   */
  sessionTitle?: string;
  /** Permission/question request id — the key resolution matches on. */
  requestID?: string;
  title: string;
  body: string;
  click?: string;
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
  sessionTitle?: string;
  requestID?: string;
  title: string;
  body: string;
  click?: string;
  delivery: NotificationDelivery;
}

/**
 * Server-side noise filters. They apply to the record list *and* the badge
 * count together: a badge that counts rows the user asked not to see is the
 * clutter this exists to remove, just relocated.
 *
 * Absent means "no filtering", so every existing API consumer is unaffected;
 * the UI always sends both flags explicitly.
 */
export interface HistoryFilters {
  hideAutoApproved?: boolean;
  hideSubagent?: boolean;
}

export interface HistoryQuery extends HistoryFilters {
  limit?: number;
  kind?: NotifyEvent;
  directory?: string;
  state?: "all" | "active" | "resolved";
}

/** Active-record tallies per suppression category, so each filter can label its own cost. */
export type SuppressedActiveCounts = Record<SuppressionReason, number>;

export function isSuppressionReason(value: unknown): value is SuppressionReason {
  return typeof value === "string" && (SUPPRESSION_REASONS as readonly string[]).includes(value);
}

export function isFilteredOut(record: NotificationRecord, filters: HistoryFilters): boolean {
  if (filters.hideAutoApproved && record.delivery.suppressed === "auto-permissions") return true;
  if (filters.hideSubagent && record.delivery.suppressed === "subagent") return true;
  return false;
}

export const HISTORY_LIMIT = 500;
const MAX_PAGE = 200;
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
    desktop: source.desktop === "allowed" ? "allowed" : "off",
    ...(isSuppressionReason(source.suppressed) ? { suppressed: source.suppressed } : {}),
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
    ...(optionalString(source.sessionTitle) ? { sessionTitle: String(source.sessionTitle) } : {}),
    ...(optionalString(source.requestID) ? { requestID: String(source.requestID) } : {}),
    title: typeof source.title === "string" ? source.title : "",
    body: typeof source.body === "string" ? source.body : "",
    ...(optionalString(source.click) ? { click: String(source.click) } : {}),
    ...(Number.isFinite(resolvedAt) ? { resolvedAt } : {}),
    ...(optionalString(source.resolvedBy) ? { resolvedBy: source.resolvedBy as ResolutionReason } : {}),
    ...(Number.isFinite(parkedAt) ? { parkedAt } : {}),
    delivery: normalizeDelivery(source.delivery),
  };
}

export function isActive(record: NotificationRecord): boolean {
  return record.resolvedAt === undefined;
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
          .filter((record): record is NotificationRecord => record !== null);
        this.prune();
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
        await writeFile(temporary, `${JSON.stringify({ version: 2, records: snapshot }, null, 2)}\n`, {
          mode: 0o600,
        });
        await rename(temporary, this.file);
      })
      .catch((error: unknown) => {
        console.warn("[notification-history]", error instanceof Error ? error.message : String(error));
      });
  }

  /**
   * Keep every unresolved *delivered* record, plus the newest records in each
   * capped category.
   *
   * The checklist invariant — an unresolved record must never disappear before
   * the user checks it off — is what the badge means, so it is preserved for
   * everything the user was actually pinged about. Suppressed records were
   * never delivered and are hidden by default, so they are a bounded audit
   * trail rather than a checklist; a busy project with auto-permissions on or
   * many sub-agents would otherwise grow the log without limit.
   */
  private prune(): void {
    this.capOldest((record) => !isActive(record));
    this.capOldest((record) => isActive(record) && record.delivery.suppressed !== undefined);
  }

  /** Drop the oldest members of a category once it exceeds the limit. */
  private capOldest(match: (record: NotificationRecord) => boolean): void {
    const matched = this.records.filter(match);
    if (matched.length <= this.limit) return;
    const drop = new Set(matched.slice(0, matched.length - this.limit).map((record) => record.id));
    this.records = this.records.filter((record) => !drop.has(record.id));
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
      ...(entry.sessionTitle ? { sessionTitle: entry.sessionTitle } : {}),
      ...(entry.requestID ? { requestID: entry.requestID } : {}),
      title: entry.title,
      body: entry.body,
      ...(entry.click ? { click: entry.click } : {}),
      delivery: entry.delivery,
    };
    this.records.push(record);
    this.prune();
    this.persist();
    return record;
  }

  /** The sole mutation of resolved state: an explicit user checkbox action. */
  async setResolved(id: string, resolved: boolean, at = Date.now()): Promise<NotificationRecord | undefined> {
    await this.load();
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) return undefined;
    if (resolved && isActive(record)) {
      record.resolvedAt = at;
      record.resolvedBy = "checked";
    } else if (!resolved && !isActive(record)) {
      delete record.resolvedAt;
      delete record.resolvedBy;
    } else {
      return record;
    }
    if (resolved) {
      this.prune();
    }
    this.persist();
    return record;
  }

  /** Stamp the escalation onto the parent permission so the UI can flag it. */
  async markParked(directory: string | undefined, requestID: string, at = Date.now()): Promise<boolean> {
    await this.load();
    const parent = this.records.find(
      (record) =>
        record.kind === "permission" &&
        record.requestID === requestID &&
        record.directory === directory,
    );
    if (!parent) return false;
    parent.parkedAt = at;
    this.persist();
    return true;
  }

  /** Unresolved rows the user would actually see under `filters`. */
  async activeCount(directory?: string, filters: HistoryFilters = {}): Promise<number> {
    await this.load();
    return this.records.reduce(
      (total, record) =>
        total +
        (isActive(record) && (!directory || record.directory === directory) && !isFilteredOut(record, filters)
          ? 1
          : 0),
      0,
    );
  }

  /**
   * How many unresolved rows each filter is responsible for hiding. Reported
   * whether or not the filter is on, so a checkbox can state its own cost
   * instead of silently swallowing records.
   */
  async suppressedActiveCounts(directory?: string): Promise<SuppressedActiveCounts> {
    await this.load();
    const counts: SuppressedActiveCounts = { "auto-permissions": 0, subagent: 0 };
    for (const record of this.records) {
      if (!isActive(record)) continue;
      if (directory && record.directory !== directory) continue;
      const reason = record.delivery.suppressed;
      if (reason) counts[reason] += 1;
    }
    return counts;
  }

  async list(query: HistoryQuery = {}): Promise<NotificationRecord[]> {
    await this.load();
    const limit = Math.max(1, Math.min(MAX_PAGE, Math.trunc(query.limit ?? 100) || 100));
    const state = query.state ?? "all";
    return this.records
      .filter((record) => {
        if (query.kind && record.kind !== query.kind) return false;
        if (query.directory && record.directory !== query.directory) return false;
        if (isFilteredOut(record, query)) return false;
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

}
