import { describe, expect, it } from "vitest";

import type { PlanningItem } from "../client/lib/api.js";
import { groupPlanningItems, planningPriorities } from "../client/lib/planningGroups.js";

function item(number: number, labels: string[]): PlanningItem {
  return {
    id: String(number),
    number,
    type: "issue",
    title: `Item ${number}`,
    state: "open",
    merged: false,
    labels,
    author: "maintainer",
    url: `https://example.com/${number}`,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
    commentCount: 0,
  };
}

describe("planning groups", () => {
  it("orders every priority bucket and puts conflicts in triage once", () => {
    const sections = groupPlanningItems([
      item(1, ["priority:low"]),
      item(2, ["priority:high", "priority:low"]),
      item(3, []),
      item(4, ["priority:medium"]),
      item(5, ["priority:high"]),
    ]);

    expect(sections.map((section) => section.id)).toEqual(["conflict", "high", "medium", "low", "none"]);
    expect(sections.flatMap((section) => section.groups.flatMap((group) => group.items.map((entry) => entry.number))))
      .toEqual([2, 5, 4, 1, 3]);
  });

  it("does not treat duplicate spellings of one priority as a conflict", () => {
    const duplicate = item(1, ["priority:high", "PRIORITY:HIGH"]);
    expect(planningPriorities(duplicate)).toEqual(["high"]);
    expect(groupPlanningItems([duplicate])[0].id).toBe("high");
  });

  it("chooses a deterministic tag, puts untagged last, and preserves item order", () => {
    const sections = groupPlanningItems([
      item(1, ["priority:high", "mobile", "frontend"]),
      item(2, ["priority:high"]),
      item(3, ["priority:high", "frontend"]),
    ]);

    expect(sections[0].groups.map((group) => group.label)).toEqual(["frontend", "Untagged"]);
    expect(sections[0].groups.flatMap((group) => group.items.map((entry) => entry.number))).toEqual([1, 3, 2]);
  });
});
