// client/lib/hubAttention.ts
//
// Pure logic for the Hub's "needs attention" band: running sessions and
// unresolved-notification sessions, both cross-project. Mirrors the style of
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

export interface AttentionSummary {
  running: SessionSummary[];
  notificationGroups: SessionGroup[];
  /** True when neither band has anything to show — the section renders nothing at all. */
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

export function buildAttentionSummary(
  recents: SessionSummary[],
  records: NotificationRecord[],
): AttentionSummary {
  const running = attentionRunningSessions(recents);
  const notificationGroups = attentionNotificationGroups(records);
  return { running, notificationGroups, isEmpty: running.length === 0 && notificationGroups.length === 0 };
}
