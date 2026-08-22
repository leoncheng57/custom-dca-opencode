import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_VIEW,
  loadNotificationView,
  normalizeNotificationView,
  saveNotificationView,
} from "../client/lib/notificationView.js";
import {
  deliverySummary,
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

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    saveNotificationView({ version: 1, hideAutoApproved: false, hideSubagent: true, resolvedExpanded: true }, storage);
    expect(loadNotificationView(storage)).toEqual({
      version: 1,
      hideAutoApproved: false,
      hideSubagent: true,
      resolvedExpanded: true,
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
    expect(deliverySummary(base)).toBe("ntfy off · desktop off");
    expect(SUPPRESSION_LABEL.subagent).toBe("sub-agent");
  });
});
