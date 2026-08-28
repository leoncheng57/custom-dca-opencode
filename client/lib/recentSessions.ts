import type { SessionSummary } from "./api.js";

export const RECENT_SESSIONS_STORAGE_KEY = "opencode.recentSessions.v1";
export const MAX_STORED_RECENT_SESSIONS = 50;
// Raised from 5 to 25 (issue #44): both Recents columns render this many rows in a
// scrollable container rather than truncating a short static list.
export const MAX_VISIBLE_RECENT_SESSIONS = 25;

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

/**
 * Session ids are unique per project, not globally, so a cross-project view
 * has to key on the pair. Matching on id alone would let a session from one
 * project render under another project's label.
 */
function sessionKey(directory: string, id: string): string {
  return `${normalizeRecentDirectory(directory)}\u0000${id}`;
}

/** Distinct projects present in browser history, newest first. */
export function recentDirectories(
  entries: RecentSessionOpen[],
  limit = MAX_STORED_RECENT_SESSIONS,
): string[] {
  const directories: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const directory = normalizeRecentDirectory(entry.directory);
    if (!directory || seen.has(directory)) continue;
    seen.add(directory);
    directories.push(directory);
    if (directories.length >= limit) break;
  }
  return directories;
}

export function recentlyOpenedSessions(
  sessions: SessionSummary[],
  entries: RecentSessionOpen[],
  limit = MAX_VISIBLE_RECENT_SESSIONS,
): SessionSummary[] {
  const sessionsByKey = new Map(
    sessions.map((session) => [sessionKey(session.directory, session.id), session]),
  );
  return entries
    .map((entry) => sessionsByKey.get(sessionKey(entry.directory, entry.id)))
    .filter((session): session is SessionSummary => Boolean(session))
    .slice(0, visibleLimit(limit));
}

export function recentlyActiveSessions(
  sessions: SessionSummary[],
  limit = MAX_VISIBLE_RECENT_SESSIONS,
): SessionSummary[] {
  return sessions
    .map((session, index) => ({ session, index, updatedAt: Date.parse(session.updatedAt) }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.updatedAt) ? left.updatedAt : 0;
      const rightTime = Number.isFinite(right.updatedAt) ? right.updatedAt : 0;
      return rightTime - leftTime || left.index - right.index;
    })
    .slice(0, visibleLimit(limit))
    .map(({ session }) => session);
}
