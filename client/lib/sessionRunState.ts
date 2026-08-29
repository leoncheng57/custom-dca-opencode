// client/lib/sessionRunState.ts
//
// Joins notification records to the running/idle state of the sessions that
// produced them, for the notification popover and the full history page.
//
// Why three states rather than a boolean
// --------------------------------------
// `SessionSummary.running` is derived server-side from `GET /session/status`,
// which is process-local: it only reports sessions owned by the connected
// OpenCode process, and `runningSessions()` degrades to an empty set when the
// call fails (server/opencode/sessions.ts:269). So `false` means "the process
// we asked did not call this busy", which is a real answer only for a session
// that process actually knows about.
//
// A notification, by contrast, can outlive the process that produced it: the
// history file is durable and the record survives a restart. Asking about a
// session nobody currently owns must therefore produce `unknown`, never a
// confident `idle` — the repo already treats `unknown` as a first-class answer
// for sub-agent state for exactly this reason (AGENTS.md decision 13).
//
// The distinction is drawn by presence, not by the flag: a session the fan-out
// returned answers `running`/`idle` from its own `running` field, and a session
// the fan-out never returned answers `unknown`.
//
// Why this reuses /api/recent-sessions
// ------------------------------------
// The popover is cross-project, so a per-directory `/sessions` call is the
// wrong shape. `/api/recent-sessions` is the one route that already fans out
// across directories, and it is already bounded on every axis that matters
// (RECENT_DIRECTORY_LIMIT 40, RECENT_LOOKUP_LIMIT 50, concurrency-limited
// per-directory reads — AGENTS.md decision 12). Reusing it adds no new backend
// route, no new upstream call shape, and no per-row request. The caps below
// mirror the server's so the client never sends candidates the server would
// silently drop; anything past them simply reads `unknown`, which is honest.

import type { NotificationRecord, SessionSummary } from "./api.js";

export type SessionRunState = "running" | "idle" | "unknown";

/** Mirrors RECENT_DIRECTORY_LIMIT in server/routes/recents.ts. */
export const STATUS_DIRECTORY_LIMIT = 40;
/** Mirrors RECENT_LOOKUP_LIMIT in server/routes/recents.ts. */
export const STATUS_SESSION_LIMIT = 50;

export interface StatusCandidates {
  directories: string[];
  sessionIDs: string[];
}

/**
 * The bounded set of sessions worth asking about, unresolved work first.
 *
 * Ordering is deliberate rather than incidental. Resolution is manual-only
 * (AGENTS.md decision 10), so a long-lived deployment accumulates a large
 * resolved archive that shares the same window as the handful of rows the user
 * still has to act on. Taking records in raw order would let that archive
 * consume the 50-id budget and leave the active rows — the only ones whose
 * status changes anything — reading `unknown`. Unresolved records therefore
 * claim the budget first, and resolved records fill whatever is left.
 *
 * Both lists are deduplicated in first-seen order, so under the cap the newest
 * work survives.
 */
export function statusCandidates(
  records: readonly NotificationRecord[],
  limits: { directories?: number; sessions?: number } = {},
): StatusCandidates {
  const directoryLimit = limits.directories ?? STATUS_DIRECTORY_LIMIT;
  const sessionLimit = limits.sessions ?? STATUS_SESSION_LIMIT;

  const ordered = [
    ...records.filter((record) => record.resolvedAt === undefined),
    ...records.filter((record) => record.resolvedAt !== undefined),
  ];

  const sessionIDs: string[] = [];
  const seenSessions = new Set<string>();
  const directories: string[] = [];
  const seenDirectories = new Set<string>();

  for (const record of ordered) {
    const { sessionID, directory } = record;
    if (!sessionID || seenSessions.has(sessionID)) continue;
    if (sessionIDs.length >= sessionLimit) break;
    seenSessions.add(sessionID);
    sessionIDs.push(sessionID);
    // Only directories that carry a session we are actually asking about are
    // worth fanning out to: a directory contributes upstream calls, and one
    // whose sessions all fell past the id cap would cost them for nothing.
    if (!directory || seenDirectories.has(directory)) continue;
    if (directories.length >= directoryLimit) continue;
    seenDirectories.add(directory);
    directories.push(directory);
  }

  return { directories, sessionIDs };
}

/**
 * Index the fan-out's answers by session id.
 *
 * Presence in this map is the whole claim: a session that answered is reported
 * as `running` or `idle`, and one that did not is absent, which `runStateFor`
 * reads as `unknown`.
 */
export function runStateMap(sessions: readonly SessionSummary[]): ReadonlyMap<string, SessionRunState> {
  const map = new Map<string, SessionRunState>();
  for (const session of sessions) {
    if (!session.id) continue;
    map.set(session.id, session.running ? "running" : "idle");
  }
  return map;
}

/** `unknown` for a session with no id, and for one the fan-out never covered. */
export function runStateFor(
  map: ReadonlyMap<string, SessionRunState>,
  sessionID?: string,
): SessionRunState {
  if (!sessionID) return "unknown";
  return map.get(sessionID) ?? "unknown";
}
