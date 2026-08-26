// client/lib/notificationGroups.ts
//
// Groups notification records by the session that produced them.
//
// This is presentation only. Unlike the two noise filters it is never sent to
// the server: it changes neither which records exist nor the unresolved count,
// so the badge cannot disagree with the rows however it is set.
//
// Identity is the session id, never the title. `sessionTitle` is snapshotted at
// append time (server/notifications/history.ts), so one session contributes
// several different titles across its life as it is renamed, and two unrelated
// sessions can easily share one. Keying on the title would therefore both split
// a session and merge strangers.

import type { NotificationRecord, NotifyEvent } from "./api.js";

/** Bucket for records the server never attached a session to. Always sorts last. */
export const NO_SESSION_KEY = "__no-session__";
export const NO_SESSION_LABEL = "No session";

/** Shown when a session is known but never had a title we could snapshot. */
export const UNTITLED_SESSION_LABEL = "Untitled session";

/**
 * Chip order: most blocking first.
 *
 * Groups start collapsed, so the chip strip is the only thing a folded group
 * says about its contents. Leading with the kind that blocks an agent means the
 * first word of a folded row is the reason to open it.
 */
export const CHIP_ORDER: readonly NotifyEvent[] = [
  "permission",
  "question",
  "parked",
  "error",
  "abort",
  "idle",
];

export interface SessionGroupChip {
  kind: NotifyEvent;
  count: number;
}

export interface SessionGroup {
  /** Stable identity — a session id, or NO_SESSION_KEY. Never the title. */
  key: string;
  /** Header text, taken from the newest record that carries a title. */
  label: string;
  /** Untruncated session title for the tooltip, when one was ever snapshotted. */
  title?: string;
  /** Session deep link, from the newest record carrying one. Every record in a
   *  group points at the same session, so the header owns the link the rows
   *  used to repeat. */
  click?: string;
  /** Newest first. */
  records: NotificationRecord[];
  chips: SessionGroupChip[];
  /** Timestamp of the newest record; the group ordering key. */
  latest: number;
}

function groupKey(record: NotificationRecord): string {
  return record.sessionID ?? NO_SESSION_KEY;
}

/**
 * Tally kinds present in the group, in blocking-first order.
 *
 * Kinds absent from the group are omitted rather than rendered as zero: a
 * folded group has one line to spend and empty categories are not news.
 */
function chipsFor(records: NotificationRecord[]): SessionGroupChip[] {
  const counts = new Map<NotifyEvent, number>();
  for (const record of records) counts.set(record.kind, (counts.get(record.kind) ?? 0) + 1);
  return CHIP_ORDER.filter((kind) => counts.has(kind)).map((kind) => ({
    kind,
    count: counts.get(kind) ?? 0,
  }));
}

/**
 * Group records by session, newest group first.
 *
 * Input order is not trusted — records are sorted by timestamp within each
 * group — but the sort is stable, so records sharing a timestamp keep the
 * order the server returned them in.
 */
export function groupBySession(records: NotificationRecord[]): SessionGroup[] {
  const buckets = new Map<string, NotificationRecord[]>();
  for (const record of records) {
    const key = groupKey(record);
    const existing = buckets.get(key);
    if (existing) existing.push(record);
    else buckets.set(key, [record]);
  }

  const groups = [...buckets.entries()].map(([key, bucket]) => {
    const ordered = [...bucket].sort((left, right) => right.at - left.at);
    const newest = ordered[0];
    // The label follows the row's own precedence (session title, then the
    // outbound title) so a group header never says less than the row it
    // replaced.
    const titled = ordered.find((record) => record.sessionTitle !== undefined);
    const label =
      key === NO_SESSION_KEY
        ? NO_SESSION_LABEL
        : (titled?.sessionTitle || newest?.title || UNTITLED_SESSION_LABEL);
    const click = ordered.find((record) => record.click !== undefined)?.click;
    return {
      key,
      label,
      ...(key !== NO_SESSION_KEY && titled?.sessionTitle ? { title: titled.sessionTitle } : {}),
      ...(click ? { click } : {}),
      records: ordered,
      chips: chipsFor(ordered),
      latest: newest?.at ?? 0,
    } satisfies SessionGroup;
  });

  return groups.sort((left, right) => {
    // Records with no session are structural leftovers rather than work, so
    // they sit below every real session no matter how recent they are.
    if (left.key === NO_SESSION_KEY) return 1;
    if (right.key === NO_SESSION_KEY) return -1;
    return right.latest - left.latest;
  });
}
