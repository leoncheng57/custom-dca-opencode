import { describe, expect, it } from "vitest";

import {
  NEVER_DELIVERED,
  NOTIFY_EVENT_CATALOGUE,
  NOTIFY_EVENT_GROUPS,
  notifyEventLabel,
  notifyEventsInGroup,
  RECOMMENDED_NOTIFY_EVENTS,
} from "../client/lib/notificationEvents.js";
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFY_EVENTS } from "../server/notifications/preferences.js";

describe("notification event catalogue", () => {
  it("labels every wire event exactly once", () => {
    // A missing entry would silently drop a row from the delivery matrix, so
    // the catalogue is checked against the wire enum rather than trusted.
    expect(NOTIFY_EVENT_CATALOGUE.map((descriptor) => descriptor.event).sort()).toEqual([...NOTIFY_EVENTS].sort());
    expect(new Set(NOTIFY_EVENT_CATALOGUE.map((descriptor) => descriptor.label)).size).toBe(NOTIFY_EVENTS.length);
  });

  it("never shows a raw wire value as a label", () => {
    for (const { event, label, description } of NOTIFY_EVENT_CATALOGUE) {
      expect(label.toLowerCase()).not.toBe(event);
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it("places every event in a declared group, and leaves no group empty", () => {
    const groups = new Set(NOTIFY_EVENT_GROUPS.map((group) => group.id));
    for (const descriptor of NOTIFY_EVENT_CATALOGUE) expect(groups.has(descriptor.group)).toBe(true);
    for (const group of NOTIFY_EVENT_GROUPS) expect(notifyEventsInGroup(group.id).length).toBeGreaterThan(0);
    expect(NOTIFY_EVENT_GROUPS.flatMap((group) => notifyEventsInGroup(group.id))).toHaveLength(NOTIFY_EVENTS.length);
  });

  it("groups a finished turn with the other events that are waiting on you", () => {
    // `idle` is not a question, but the run has still stopped and will not
    // resume without the user — which is why it ships on by default.
    expect(notifyEventsInGroup("waiting").map((descriptor) => descriptor.event))
      .toEqual(["permission", "question", "parked", "idle"]);
    expect(notifyEventsInGroup("expected").map((descriptor) => descriptor.event)).toEqual(["abort"]);
  });

  it("keeps the recommended profile identical to the shipped server default", () => {
    // "Only what needs me" promises to restore the default. If the two ever
    // drift, the button quietly lies, so this is the assertion that matters.
    expect(RECOMMENDED_NOTIFY_EVENTS).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.browser.events);
    expect(RECOMMENDED_NOTIFY_EVENTS).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.ntfy.events);
  });

  it("recommends every event that needs a human and nothing that does not", () => {
    expect(RECOMMENDED_NOTIFY_EVENTS).toEqual({
      permission: true,
      question: true,
      parked: true,
      idle: true,
      error: true,
      abort: false,
    });
  });

  it("names both categories that are recorded but never delivered", () => {
    expect(NEVER_DELIVERED).toHaveLength(2);
    expect(NEVER_DELIVERED.join(" ")).toMatch(/sub-agent/i);
    expect(NEVER_DELIVERED.join(" ")).toMatch(/auto permissions/i);
  });

  it("falls back to the wire value for an unknown event", () => {
    expect(notifyEventLabel("permission")).toBe("Needs your permission");
    expect(notifyEventLabel("nonsense" as never)).toBe("nonsense");
  });
});
