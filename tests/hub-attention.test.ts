import { describe, expect, it } from "vitest";

import type { NotificationRecord, SessionSummary } from "../client/lib/api.js";
import {
  attentionNotificationGroups,
  attentionRunningSessions,
  buildAttentionRows,
  buildAttentionSummary,
} from "../client/lib/hubAttention.js";

function session(id: string, running: boolean, updatedAt: string): SessionSummary {
  return {
    id,
    title: `Session ${id}`,
    directory: "/repo",
    childCount: 0,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    createdAt: updatedAt,
    updatedAt,
    archived: false,
    running,
  };
}

function record(overrides: Partial<NotificationRecord> & Pick<NotificationRecord, "id" | "kind" | "at">): NotificationRecord {
  return {
    directory: "/repo",
    title: "Notification",
    body: "Notification body",
    delivery: { ntfy: "off", desktop: "off" },
    ...overrides,
  };
}

describe("attentionRunningSessions", () => {
  it("keeps only running sessions, newest-active first", () => {
    const sessions = [
      session("idle-one", false, "2026-01-01T00:00:00.000Z"),
      session("running-old", true, "2026-01-01T00:00:01.000Z"),
      session("running-new", true, "2026-01-01T00:00:05.000Z"),
    ];
    expect(attentionRunningSessions(sessions).map((s) => s.id)).toEqual(["running-new", "running-old"]);
  });

  it("bounds the result", () => {
    const sessions = Array.from({ length: 15 }, (_, index) =>
      session(`s-${index}`, true, new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()));
    expect(attentionRunningSessions(sessions, 3)).toHaveLength(3);
    expect(attentionRunningSessions(sessions)).toHaveLength(10);
  });

  it("returns an empty list when nothing is running", () => {
    expect(attentionRunningSessions([session("idle", false, "2026-01-01T00:00:00.000Z")])).toEqual([]);
  });
});

describe("attentionNotificationGroups", () => {
  it("excludes resolved records", () => {
    const records = [
      record({ id: "r1", kind: "permission", at: 1, sessionID: "ses-a", resolvedAt: undefined }),
      record({ id: "r2", kind: "idle", at: 2, sessionID: "ses-b", resolvedAt: 123 }),
    ];
    const groups = attentionNotificationGroups(records);
    expect(groups.map((group) => group.key)).toEqual(["ses-a"]);
  });

  it("groups by session the same way the notification popover does", () => {
    const records = [
      record({ id: "r1", kind: "permission", at: 1, sessionID: "ses-a" }),
      record({ id: "r2", kind: "idle", at: 2, sessionID: "ses-a" }),
      record({ id: "r3", kind: "question", at: 3, sessionID: "ses-b" }),
    ];
    const groups = attentionNotificationGroups(records);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.key === "ses-a")?.chips.map((chip) => chip.kind)).toEqual(["permission", "idle"]);
  });

  it("bounds the result", () => {
    const records = Array.from({ length: 15 }, (_, index) =>
      record({ id: `r-${index}`, kind: "idle", at: index, sessionID: `ses-${index}` }));
    expect(attentionNotificationGroups(records, 3)).toHaveLength(3);
    expect(attentionNotificationGroups(records)).toHaveLength(10);
  });
});

describe("buildAttentionRows", () => {
  it("merges a session that is both running and has an unresolved notification into one row", () => {
    const recents = [session("ses-a", true, "2026-01-01T00:00:00.000Z")];
    const records = [record({ id: "r1", kind: "permission", at: 1, sessionID: "ses-a" })];
    const rows = buildAttentionRows(recents, records);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "ses-a", running: true });
    expect(rows[0].session?.id).toBe("ses-a");
    expect(rows[0].notification?.key).toBe("ses-a");
  });

  it("keeps a running session with no notification as a running-only row", () => {
    const recents = [session("ses-running", true, "2026-01-01T00:00:00.000Z")];
    const rows = buildAttentionRows(recents, []);
    expect(rows).toEqual([{ key: "ses-running", running: true, session: rows[0].session, notification: undefined }]);
  });

  it("keeps a notification-only session (not running) as its own row, after running rows", () => {
    const recents = [session("ses-running", true, "2026-01-01T00:00:00.000Z")];
    const records = [record({ id: "r1", kind: "idle", at: 1, sessionID: "ses-idle" })];
    const rows = buildAttentionRows(recents, records);
    expect(rows.map((row) => row.key)).toEqual(["ses-running", "ses-idle"]);
    expect(rows[1].running).toBe(false);
    expect(rows[1].session).toBeUndefined();
    expect(rows[1].notification?.key).toBe("ses-idle");
  });

  it("bounds the merged total, not each half independently", () => {
    const recents = Array.from({ length: 6 }, (_, index) =>
      session(`running-${index}`, true, new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()));
    const records = Array.from({ length: 6 }, (_, index) =>
      record({ id: `r-${index}`, kind: "idle", at: index, sessionID: `notify-${index}` }));
    expect(buildAttentionRows(recents, records, 8)).toHaveLength(8);
  });
});

describe("buildAttentionSummary", () => {
  it("reports empty when nothing is running and nothing is unresolved", () => {
    expect(buildAttentionSummary([session("idle", false, "2026-01-01T00:00:00.000Z")], [])).toEqual({
      rows: [],
      isEmpty: true,
    });
  });

  it("combines both bands, merging duplicates, and reports non-empty", () => {
    const recents = [session("ses-a", true, "2026-01-01T00:00:00.000Z")];
    const records = [record({ id: "r1", kind: "permission", at: 1, sessionID: "ses-a" })];
    const summary = buildAttentionSummary(recents, records);
    expect(summary.isEmpty).toBe(false);
    expect(summary.rows).toHaveLength(1);
  });
});
