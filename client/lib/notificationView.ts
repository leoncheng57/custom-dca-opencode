// client/lib/notificationView.ts
//
// How the notification centre is being looked at. Two kinds of state live here
// and they are deliberately stored in different places:
//
//   * Device-local preferences (below) — which categories of noise are folded
//     away, whether the resolved list is expanded, how groups are collapsed.
//     Persisted per browser, never in the URL: they describe this device's
//     habits, not a particular view worth sharing.
//   * The Active/Resolved list state (`parseNotificationHistoryState`) — which
//     lives in the URL instead, because "the unresolved ones" is exactly the
//     view a user wants to bookmark, share, or return to.
//
// These are deliberately *not* server preferences. They say nothing about what
// gets delivered — the server still records every notification either way —
// only about what this browser wants to look at. Storing them per device keeps
// a phone's cramped popover independent of a desktop's.
//
// The two hide flags are, however, sent to the server on every history fetch,
// because the badge count has to agree with the rows: a red "12" over a list
// showing two items is the clutter this feature exists to remove, relocated.
//
// Session grouping is on the other side of that line and stays local: it
// reorders rows the server already sent and hides nothing, so no count can
// disagree with it.

import type { NotificationHistoryState } from "./api.js";

export const NOTIFICATION_VIEW_STORAGE_KEY = "opencode-notification-view-v1";

/** Query parameter carrying the Active/Resolved split, so it can be linked. */
export const NOTIFICATION_STATE_PARAM = "state";

/**
 * Read the list state out of a URL.
 *
 * "all" is the default and is represented by the parameter being absent rather
 * than by `state=all`, so the canonical link to the whole history stays the
 * bare route. Anything unrecognized degrades to "all": a stale or hand-edited
 * link should show the reader everything, never an error.
 */
export function parseNotificationHistoryState(value: string | null | undefined): NotificationHistoryState {
  const candidate = value?.trim().toLowerCase();
  return candidate === "active" || candidate === "resolved" ? candidate : "all";
}

export interface NotificationViewPreferences {
  version: 1;
  /**
   * Hide permission notifications raised while auto-permissions was on. They
   * were preapproved, so there was never a decision for the user to make.
   */
  hideAutoApproved: boolean;
  /** Hide notifications from delegated child sessions. */
  hideSubagent: boolean;
  /**
   * Hide records whose event kind is switched off in every delivery channel.
   * Recorded so "why was I never told?" stays answerable, but never delivered,
   * so they are noise in an inbox by default.
   */
  hidePreferenceOff: boolean;
  /** Whether the popover's resolved list is expanded. */
  resolvedExpanded: boolean;
  /** Collect rows under one collapsible header per session. */
  groupBySession: boolean;
  /**
   * Whether session groups start folded.
   *
   * Deliberately one global boolean rather than a set of collapsed session ids:
   * session ids are unbounded and outlive the sessions themselves, so a
   * per-group memory would grow forever and accumulate ids of deleted work.
   * Within a visit, individual groups toggle in memory on top of this default.
   */
  groupsCollapsed: boolean;
}

/**
 * Both filters default on. Auto-approved and sub-agent records are the two
 * categories the server never delivered a ping for, so showing them by default
 * would put items in an inbox that the user was, by construction, never asked
 * to act on.
 *
 * Grouping defaults on and folded. A session that needs three things produced
 * three rows repeating its title, which is the clutter this exists to remove.
 * Folding is safe only because a collapsed group still names the kinds waiting
 * inside it; without that chip strip this default would hide an unanswered
 * permission behind a number.
 */
export const DEFAULT_NOTIFICATION_VIEW: NotificationViewPreferences = {
  version: 1,
  hideAutoApproved: true,
  hideSubagent: true,
  hidePreferenceOff: true,
  resolvedExpanded: false,
  groupBySession: true,
  groupsCollapsed: true,
};

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Absent keys take the current default rather than failing the parse, so a view
 * stored before grouping existed upgrades in place with no migration and no
 * version bump.
 */
export function normalizeNotificationView(value: unknown): NotificationViewPreferences {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    version: 1,
    hideAutoApproved: boolean(source.hideAutoApproved, DEFAULT_NOTIFICATION_VIEW.hideAutoApproved),
    hideSubagent: boolean(source.hideSubagent, DEFAULT_NOTIFICATION_VIEW.hideSubagent),
    hidePreferenceOff: boolean(source.hidePreferenceOff, DEFAULT_NOTIFICATION_VIEW.hidePreferenceOff),
    resolvedExpanded: boolean(source.resolvedExpanded, DEFAULT_NOTIFICATION_VIEW.resolvedExpanded),
    groupBySession: boolean(source.groupBySession, DEFAULT_NOTIFICATION_VIEW.groupBySession),
    groupsCollapsed: boolean(source.groupsCollapsed, DEFAULT_NOTIFICATION_VIEW.groupsCollapsed),
  };
}

/** Corrupt or blocked storage falls back to defaults rather than throwing. */
export function loadNotificationView(storage?: Pick<Storage, "getItem">): NotificationViewPreferences {
  try {
    const raw = (storage ?? localStorage).getItem(NOTIFICATION_VIEW_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_NOTIFICATION_VIEW };
    return normalizeNotificationView(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFICATION_VIEW };
  }
}

export function saveNotificationView(
  preferences: NotificationViewPreferences,
  storage?: Pick<Storage, "setItem">,
): NotificationViewPreferences {
  const normalized = normalizeNotificationView(preferences);
  try {
    (storage ?? localStorage).setItem(NOTIFICATION_VIEW_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be blocked by browser privacy settings; the in-memory view still works.
  }
  return normalized;
}
