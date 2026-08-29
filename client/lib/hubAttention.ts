// client/lib/hubAttention.ts
//
// Pure logic for the Hub's "needs attention" band: running sessions and
// unresolved-notification sessions, both cross-project, merged into one row
// per session so a session that is both running and has an unresolved
// notification renders once rather than twice. Mirrors the style of
// recentSessions.ts — presentation-agnostic derivation, testable without a
// DOM.
//
// The notification half reuses groupBySession from notificationGroups.ts —
// the same grouping the notification popover uses — so this band and the
// popover can never disagree about which sessions count as needing
// attention. Only unresolved records (resolvedAt === undefined) count here;
// the caller already fetched the current view's records via
// useNotificationCenter(), so this module does no fetching of its own.

import type { NotificationRecord, SessionSummary } from "./api.js";
import { groupBySession, type SessionGroup } from "./notificationGroups.js";

/** Bounded so a very busy account doesn't turn the band into another list to scroll. */
export const MAX_ATTENTION_ROWS = 10;

export interface AttentionRow {
  /** Stable identity — a session id, or the notification group's key (e.g. "no session"). */
  key: string;
  running: boolean;
  /** Present when this row has a running session; carries its title, directory, link target. */
  session?: SessionSummary;
  /** Present when this session (or this row) also has at least one unresolved notification. */
  notification?: SessionGroup;
}

export interface AttentionSummary {
  rows: AttentionRow[];
  /** True when there is nothing for the band to show — the section renders nothing at all. */
  isEmpty: boolean;
}

/**
 * Running sessions from the cross-project recents pool, most-recently-active
 * first.
 */
export function attentionRunningSessions(
  recents: SessionSummary[],
  limit = MAX_ATTENTION_ROWS,
): SessionSummary[] {
  return recents
    .filter((session) => session.running)
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt);
      const rightTime = Date.parse(right.updatedAt);
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    .slice(0, Math.max(0, limit));
}

/**
 * Sessions with at least one unresolved notification, newest group first.
 */
export function attentionNotificationGroups(
  records: NotificationRecord[],
  limit = MAX_ATTENTION_ROWS,
): SessionGroup[] {
  const unresolved = records.filter((record) => record.resolvedAt === undefined);
  return groupBySession(unresolved).slice(0, Math.max(0, limit));
}

/**
 * Merges running sessions and notification groups into one row per session.
 *
 * A session that is both running and has an unresolved notification produces
 * exactly one row carrying both `session` and `notification`; the running
 * order is preserved, and any notification group left without a matching
 * running session becomes its own trailing row.
 */
export function buildAttentionRows(
  recents: SessionSummary[],
  records: NotificationRecord[],
  limit = MAX_ATTENTION_ROWS,
): AttentionRow[] {
  const running = attentionRunningSessions(recents, limit);
  const notificationGroups = attentionNotificationGroups(records, limit);
  const notificationsBySession = new Map(notificationGroups.map((group) => [group.key, group]));
  const consumed = new Set<string>();

  const rows: AttentionRow[] = running.map((session) => {
    const notification = notificationsBySession.get(session.id);
    if (notification) consumed.add(session.id);
    return { key: session.id, running: true, session, notification };
  });

  for (const group of notificationGroups) {
    if (consumed.has(group.key)) continue;
    rows.push({ key: group.key, running: false, notification: group });
  }

  return rows.slice(0, Math.max(0, limit));
}

export function buildAttentionSummary(
  recents: SessionSummary[],
  records: NotificationRecord[],
): AttentionSummary {
  const rows = buildAttentionRows(recents, records);
  return { rows, isEmpty: rows.length === 0 };
}
