import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_VIEW,
  loadNotificationView,
  normalizeNotificationView,
  saveNotificationView,
} from "../client/lib/notificationView.js";
import {
  deliverySummary,
  notificationAction,
  SUPPRESSION_LABEL,
  truncateSessionTitle,
} from "../client/components/notification-record-row.js";
import type { NotificationRecord } from "../client/lib/api.js";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("opencode-notification-view-v1", initial);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("notification view preferences", () => {
  it("hides both noise categories by default", () => {
    // Both are categories the server deliberately never pinged for, so
    // showing them by default would fill an inbox with items nobody was asked
    // to act on.
    expect(DEFAULT_NOTIFICATION_VIEW.hideAutoApproved).toBe(true);
    expect(DEFAULT_NOTIFICATION_VIEW.hideSubagent).toBe(true);
    expect(DEFAULT_NOTIFICATION_VIEW.resolvedExpanded).toBe(false);
  });

  it("groups by session and folds the groups by default", () => {
    // Folding is only safe because a collapsed group still names the kinds
    // waiting inside it; the chip strip is what stops this default hiding an
    // unanswered permission behind a number.
    expect(DEFAULT_NOTIFICATION_VIEW.groupBySession).toBe(true);
    expect(DEFAULT_NOTIFICATION_VIEW.groupsCollapsed).toBe(true);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    saveNotificationView(
      {
        version: 1,
        hideAutoApproved: false,
        hideSubagent: true,
        resolvedExpanded: true,
        groupBySession: false,
        groupsCollapsed: false,
      },
      storage,
    );
    expect(loadNotificationView(storage)).toEqual({
      version: 1,
      hideAutoApproved: false,
      hideSubagent: true,
      resolvedExpanded: true,
      groupBySession: false,
      groupsCollapsed: false,
    });
  });

  it("upgrades a view stored before grouping existed without a version bump", () => {
    // Deployed browsers already hold a v1 view with only the three original
    // keys. Absent keys have to take the current default, or an existing
    // device would silently opt out of the feature.
    const legacy = memoryStorage(
      JSON.stringify({ version: 1, hideAutoApproved: false, hideSubagent: false, resolvedExpanded: true }),
    );
    expect(loadNotificationView(legacy)).toEqual({
      version: 1,
      hideAutoApproved: false,
      hideSubagent: false,
      resolvedExpanded: true,
      groupBySession: true,
      groupsCollapsed: true,
    });
  });

  it("falls back to defaults for absent, corrupt, and non-boolean values", () => {
    expect(loadNotificationView(memoryStorage())).toEqual(DEFAULT_NOTIFICATION_VIEW);
    expect(loadNotificationView(memoryStorage("not json"))).toEqual(DEFAULT_NOTIFICATION_VIEW);
    expect(normalizeNotificationView({ hideSubagent: "yes" })).toEqual(DEFAULT_NOTIFICATION_VIEW);
  });

  it("survives storage being blocked entirely", () => {
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadNotificationView(blocked)).toEqual(DEFAULT_NOTIFICATION_VIEW);
    expect(() => saveNotificationView(DEFAULT_NOTIFICATION_VIEW, blocked)).not.toThrow();
  });
});

describe("notification row formatting", () => {
  it("truncates a long session title on a character boundary and collapses whitespace", () => {
    expect(truncateSessionTitle("Fix   the\nnotification popover", 80)).toBe("Fix the notification popover");
    expect(truncateSessionTitle("Fix the notification popover border and shadow", 20)).toBe("Fix the notificatio\u2026");
    expect(truncateSessionTitle("short", 20)).toBe("short");
  });

  it("explains each suppression rather than reporting a silent 'off'", () => {
    const base: NotificationRecord = {
      id: "n1",
      kind: "permission",
      at: 0,
      title: "OpenCode needs permission",
      body: "",
      delivery: { ntfy: "off", desktop: "off" },
    };
    expect(deliverySummary({ ...base, delivery: { ntfy: "off", desktop: "off", suppressed: "auto-permissions" } }))
      .toBe("suppressed by auto permissions");
    expect(deliverySummary({ ...base, delivery: { ntfy: "off", desktop: "off", suppressed: "subagent" } }))
      .toBe("suppressed as sub-agent activity");
    expect(deliverySummary(base)).toBe("ntfy off · desktop off · PWA push off");
    expect(deliverySummary({ ...base, delivery: { ...base.delivery, webPush: "partial", webPushError: "1 sent; 1 failed" } }))
      .toContain("PWA push partially sent: 1 sent; 1 failed");
    expect(SUPPRESSION_LABEL.subagent).toBe("sub-agent");
  });

  it("uses safe event action copy without rendering session IDs", () => {
    const base: NotificationRecord = {
      id: "n1",
      kind: "permission",
      at: 0,
      sessionID: "ses_private",
      sessionTitle: "Review notification copy",
      title: "OpenCode needs permission",
      body: "bash requires review",
      displayBody: "Needs approval to run bash",
      delivery: { ntfy: "sent", desktop: "allowed" },
    };
    expect(notificationAction(base)).toBe("Needs approval to run bash");
    expect(notificationAction({ ...base, kind: "question", displayBody: undefined })).toBe("Needs your answer");
    expect(notificationAction({ ...base, kind: "idle", displayBody: undefined })).toBe("Finished its turn and is waiting for you");
    expect(notificationAction({ ...base, kind: "error", displayBody: undefined })).toBe("Stopped with an error");
    expect(notificationAction({ ...base, kind: "parked", displayBody: undefined })).toBe("Still waiting for approval");
    expect(notificationAction({ ...base, kind: "abort", displayBody: undefined })).toBe("Stopped at your request");
  });

  it("marks suppressed rows as status records rather than pending decisions", () => {
    const base: NotificationRecord = {
      id: "n1",
      kind: "permission",
      at: 0,
      title: "OpenCode needs permission",
      body: "bash requires review",
      displayBody: "Needs approval to run bash",
      delivery: { ntfy: "off", desktop: "off", suppressed: "auto-permissions" },
    };
    expect(notificationAction(base)).toBe("Auto-approved before you were notified");
    expect(notificationAction({ ...base, delivery: { ...base.delivery, suppressed: "subagent" } }))
      .toBe("Sub-agent activity was recorded but not sent");
  });
});
