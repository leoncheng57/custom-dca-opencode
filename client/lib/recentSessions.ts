import type { SessionSummary } from "./api.js";

export const RECENT_SESSIONS_STORAGE_KEY = "opencode.recentSessions.v1";
export const MAX_STORED_RECENT_SESSIONS = 50;
export const MAX_VISIBLE_RECENT_SESSIONS = 5;

export interface RecentSessionOpen {
  id: string;
  directory: string;
  openedAt: number;
}

interface RecentSessionsPayload {
  version: 1;
  entries: RecentSessionOpen[];
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function visibleLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 0;
  return Math.min(MAX_VISIBLE_RECENT_SESSIONS, Math.max(0, Math.floor(limit)));
}

export function normalizeRecentDirectory(directory: string): string {
  const trimmed = directory.trim();
  if (/^[A-Za-z]:[\\/]$/.test(trimmed) || trimmed === "/") return trimmed;
  return trimmed.replace(/[\\/]+$/, "");
}

function isRecentSessionOpen(value: unknown): value is RecentSessionOpen {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.length > 0
    && typeof row.directory === "string" && normalizeRecentDirectory(row.directory).length > 0
    && typeof row.openedAt === "number" && Number.isFinite(row.openedAt) && row.openedAt >= 0;
}

export function readRecentSessionOpens(storage: StorageLike): RecentSessionOpen[] {
  try {
    const raw = storage.getItem(RECENT_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const payload = JSON.parse(raw) as Partial<RecentSessionsPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.entries)) return [];
    return payload.entries.filter(isRecentSessionOpen).slice(0, MAX_STORED_RECENT_SESSIONS);
  } catch {
    return [];
  }
}

export function recordRecentSessionOpen(
  storage: StorageLike,
  directory: string,
  id: string,
  openedAt = Date.now(),
): void {
  const normalizedDirectory = normalizeRecentDirectory(directory);
  if (!normalizedDirectory || !id || !Number.isFinite(openedAt) || openedAt < 0) return;
  const entries = readRecentSessionOpens(storage).filter(
    (entry) => entry.id !== id || normalizeRecentDirectory(entry.directory) !== normalizedDirectory,
  );
  entries.unshift({ id, directory: normalizedDirectory, openedAt });
  const payload: RecentSessionsPayload = {
    version: 1,
    entries: entries.slice(0, MAX_STORED_RECENT_SESSIONS),
  };
  try {
    storage.setItem(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Recents are optional when browser storage is unavailable or full.
  }
}

export function recentlyOpenedSessions(
  directory: string,
  sessions: SessionSummary[],
  entries: RecentSessionOpen[],
  limit = MAX_VISIBLE_RECENT_SESSIONS,
): SessionSummary[] {
  const scope = normalizeRecentDirectory(directory);
  const sessionsByID = new Map(
    sessions
      .filter((session) => normalizeRecentDirectory(session.directory) === scope)
      .map((session) => [session.id, session]),
  );
  return entries
    .filter((entry) => normalizeRecentDirectory(entry.directory) === scope)
    .map((entry) => sessionsByID.get(entry.id))
    .filter((session): session is SessionSummary => Boolean(session))
    .slice(0, visibleLimit(limit));
}

export function recentlyActiveSessions(
  directory: string,
  sessions: SessionSummary[],
  limit = MAX_VISIBLE_RECENT_SESSIONS,
): SessionSummary[] {
  const scope = normalizeRecentDirectory(directory);
  return sessions
    .map((session, index) => ({ session, index, updatedAt: Date.parse(session.updatedAt) }))
    .filter(({ session }) => normalizeRecentDirectory(session.directory) === scope)
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.updatedAt) ? left.updatedAt : 0;
      const rightTime = Number.isFinite(right.updatedAt) ? right.updatedAt : 0;
      return rightTime - leftTime || left.index - right.index;
    })
    .slice(0, visibleLimit(limit))
    .map(({ session }) => session);
}
