import { describe, expect, it } from "vitest";

import type { PlanningItem } from "../client/lib/api.js";
import { filterPlanningItems, groupPlanningItems, planningPriorities } from "../client/lib/planningGroups.js";

function item(number: number, labels: string[], extra: Partial<PlanningItem> = {}): PlanningItem {
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
    childCount: 0,
    completedChildCount: 0,
    parentNumber: null,
    ...extra,
  };
}

function epic(number: number, labels: string[], childCount: number): PlanningItem {
  return item(number, labels, { childCount });
}

function child(number: number, labels: string[], parentNumber: number): PlanningItem {
  return item(number, labels, { parentNumber });
}

function numbersIn(sections: ReturnType<typeof groupPlanningItems>): number[] {
  return sections.flatMap((section) =>
    section.groups.flatMap((group) => group.nodes.map((node) => node.item.number)));
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
    expect(numbersIn(sections)).toEqual([2, 5, 4, 1, 3]);
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
    expect(numbersIn(sections)).toEqual([1, 3, 2]);
  });
});

describe("planning epic hierarchy", () => {
  it("keeps every child as progress evidence when its parent matches the filters", () => {
    const parent = epic(10, ["priority:high"], 2);
    const openChild = child(11, [], 10);
    const closedChild = child(12, [], 10);
    closedChild.state = "closed";

    expect(filterPlanningItems([parent, openChild, closedChild], "all", "open").map((entry) => entry.number))
      .toEqual([10, 11, 12]);
  });

  it("keeps a matching child without its filtered parent so grouping can show a breadcrumb", () => {
    const parent = epic(10, [], 1);
    const closedChild = child(11, ["priority:low"], 10);
    closedChild.state = "closed";

    const filtered = filterPlanningItems([parent, closedChild], "all", "closed");
    expect(filtered.map((entry) => entry.number)).toEqual([11]);
    expect(groupPlanningItems(filtered)[0].groups[0].nodes[0].orphanedParentNumber).toBe(10);
  });

  it("folds a child into its parent and never gives it a top-level row", () => {
    const sections = groupPlanningItems([
      epic(10, ["priority:high"], 2),
      child(11, ["priority:high"], 10),
      child(12, [], 10),
    ]);

    expect(numbersIn(sections)).toEqual([10]);
    const node = sections[0].groups[0].nodes[0];
    expect(node.children.map((entry) => entry.number)).toEqual([11, 12]);
    expect(node.orphanedParentNumber).toBeNull();
  });

  it("preserves input order among children", () => {
    const sections = groupPlanningItems([
      epic(10, [], 3),
      child(30, [], 10),
      child(12, [], 10),
      child(21, [], 10),
    ]);

    expect(sections[0].groups[0].nodes[0].children.map((entry) => entry.number)).toEqual([30, 12, 21]);
  });

  it("renders a child whose parent is absent at top level with a breadcrumb number", () => {
    const sections = groupPlanningItems([child(11, ["priority:medium"], 10)]);

    expect(numbersIn(sections)).toEqual([11]);
    const node = sections[0].groups[0].nodes[0];
    expect(node.orphanedParentNumber).toBe(10);
    expect(node.children).toEqual([]);
  });

  it("promotes an unlabelled epic to its highest child priority", () => {
    const sections = groupPlanningItems([
      epic(10, [], 2),
      child(11, ["priority:low"], 10),
      child(12, ["priority:high"], 10),
    ]);

    expect(sections.map((section) => section.id)).toEqual(["high"]);
    expect(numbersIn(sections)).toEqual([10]);
  });

  it("counts every priority of a conflicting child toward the parent's promotion", () => {
    const sections = groupPlanningItems([
      epic(10, [], 1),
      child(11, ["priority:high", "priority:low"], 10),
    ]);

    expect(sections.map((section) => section.id)).toEqual(["high"]);
  });

  it("keeps a parent's own priority conflict in triage regardless of its children", () => {
    const sections = groupPlanningItems([
      epic(10, ["priority:medium", "priority:low"], 1),
      child(11, ["priority:high"], 10),
    ]);

    expect(sections.map((section) => section.id)).toEqual(["conflict"]);
    expect(sections[0].groups[0].nodes[0].children.map((entry) => entry.number)).toEqual([11]);
  });

  it("leaves an epic without any priority anywhere in the no-priority section", () => {
    const sections = groupPlanningItems([epic(10, [], 1), child(11, [], 10)]);
    expect(sections.map((section) => section.id)).toEqual(["none"]);
  });

  it("counts children in the section total and epics only when a child resolved", () => {
    const sections = groupPlanningItems([
      epic(10, ["priority:high"], 2),
      child(11, [], 10),
      child(12, [], 10),
      epic(20, ["priority:high"], 3),
      item(30, ["priority:high"]),
    ]);

    expect(sections[0].count).toBe(5);
    expect(sections[0].epicCount).toBe(1);
  });

  it("reports the children GitHub counted but this input does not contain", () => {
    const sections = groupPlanningItems([
      epic(10, [], 5),
      child(11, [], 10),
      child(12, [], 10),
      epic(20, [], 1),
      epic(30, [], 0),
    ]);

    const nodes = sections[0].groups[0].nodes;
    expect(nodes.map((node) => [node.item.number, node.unresolvedChildCount])).toEqual([
      [10, 3],
      [20, 1],
      [30, 0],
    ]);
  });

  it("never reports a negative unresolved count when more children resolve than GitHub counted", () => {
    const sections = groupPlanningItems([
      epic(10, [], 1),
      child(11, [], 10),
      child(12, [], 10),
    ]);

    expect(sections[0].groups[0].nodes[0].unresolvedChildCount).toBe(0);
  });

  it("takes the tag from the parent and ignores the children's labels", () => {
    const sections = groupPlanningItems([
      epic(10, ["priority:high", "server"], 1),
      child(11, ["mobile", "aaa-first-alphabetically"], 10),
    ]);

    expect(sections[0].groups.map((group) => group.label)).toEqual(["server"]);
  });

  it("keeps an unlabelled epic untagged even when its children carry tags", () => {
    const sections = groupPlanningItems([
      epic(10, [], 1),
      child(11, ["frontend"], 10),
      item(20, ["frontend"]),
    ]);

    expect(sections[0].groups.map((group) => group.label)).toEqual(["frontend", "Untagged"]);
    expect(numbersIn(sections)).toEqual([20, 10]);
  });

  it("treats a self-referencing parent as top-level rather than nesting it in itself", () => {
    const sections = groupPlanningItems([item(10, [], { parentNumber: 10 })]);

    const node = sections[0].groups[0].nodes[0];
    expect(node.item.number).toBe(10);
    expect(node.children).toEqual([]);
    expect(node.orphanedParentNumber).toBeNull();
  });
});
