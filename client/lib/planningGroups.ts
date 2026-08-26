import type { PlanningItem } from "./api.js";

export type PlanningPriority = "high" | "medium" | "low";
export type PlanningSectionId = "conflict" | PlanningPriority | "none";

/**
 * One top-level row and the epic children folded underneath it.
 *
 * A child is never *also* a top-level row: the whole point of the hierarchy is
 * that an epic collapses to one line. But a child whose parent is missing from
 * the filtered input — closed, filtered out, or beyond the BFF's 500-record
 * window — still gets its own row, with `orphanedParentNumber` set so the UI
 * can say where it belongs instead of the row silently disappearing.
 */
export interface PlanningNode {
  item: PlanningItem;
  /** Children present in this input, in input order. */
  children: PlanningItem[];
  /** Children GitHub counted that this input does not contain. */
  unresolvedChildCount: number;
  /** Set when this item names a parent that is not in the input set. */
  orphanedParentNumber: number | null;
}

export interface PlanningTagGroup {
  label: string;
  nodes: PlanningNode[];
}

export interface PlanningSection {
  id: PlanningSectionId;
  title: string;
  subtitle: string;
  defaultOpen: boolean;
  groups: PlanningTagGroup[];
  /** Every item in the section, parents and children alike. */
  count: number;
  /** Nodes that actually fold at least one child. */
  epicCount: number;
}

const PRIORITY_LABELS: Record<PlanningPriority, string> = {
  high: "priority:high",
  medium: "priority:medium",
  low: "priority:low",
};

const PRIORITY_ORDER: PlanningPriority[] = ["high", "medium", "low"];

const SECTION_DEFINITIONS: Array<Omit<PlanningSection, "groups" | "count" | "epicCount">> = [
  { id: "conflict", title: "Needs triage", subtitle: "Conflicting priority labels", defaultOpen: true },
  { id: "high", title: "Work now", subtitle: PRIORITY_LABELS.high, defaultOpen: true },
  { id: "medium", title: "Plan next", subtitle: PRIORITY_LABELS.medium, defaultOpen: false },
  { id: "low", title: "Low priority", subtitle: PRIORITY_LABELS.low, defaultOpen: false },
  { id: "none", title: "No priority", subtitle: "Items without a priority label", defaultOpen: false },
];

function normalizedLabel(label: string): string {
  return label.trim().toLocaleLowerCase();
}

export function planningPriorities(item: PlanningItem): PlanningPriority[] {
  const labels = new Set(item.labels.map(normalizedLabel));
  return PRIORITY_ORDER.filter((priority) => labels.has(PRIORITY_LABELS[priority]));
}

/** Computed from the parent alone — children never rename the group. */
function primaryTag(item: PlanningItem): string {
  return item.labels
    .filter((label) => !normalizedLabel(label).startsWith("priority:"))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))[0]
    ?? "Untagged";
}

/**
 * A node's own conflict always wins: it needs triage whatever its children say.
 * Otherwise the node sits at the highest priority anywhere in the epic, so a
 * `priority:high` child cannot be buried inside an unlabelled parent. This is
 * the deliberate exception to "the exact label selects the section".
 */
function nodeSection(node: PlanningNode): PlanningSectionId {
  const own = planningPriorities(node.item);
  if (own.length > 1) return "conflict";
  const present = new Set<PlanningPriority>(own);
  for (const child of node.children) {
    for (const priority of planningPriorities(child)) present.add(priority);
  }
  return PRIORITY_ORDER.find((priority) => present.has(priority)) ?? "none";
}

export function groupPlanningItems(items: PlanningItem[]): PlanningSection[] {
  const numbers = new Set(items.map((item) => item.number));
  const nodes: PlanningNode[] = [];
  const byNumber = new Map<number, PlanningNode>();

  for (const item of items) {
    const parentNumber = item.parentNumber !== null && item.parentNumber !== item.number ? item.parentNumber : null;
    if (parentNumber !== null && numbers.has(parentNumber)) continue;
    const node: PlanningNode = {
      item,
      children: [],
      unresolvedChildCount: Math.max(0, item.childCount),
      orphanedParentNumber: parentNumber,
    };
    nodes.push(node);
    if (!byNumber.has(item.number)) byNumber.set(item.number, node);
  }

  for (const item of items) {
    const parentNumber = item.parentNumber;
    if (parentNumber === null || parentNumber === item.number || !numbers.has(parentNumber)) continue;
    const parent = byNumber.get(parentNumber);
    if (!parent) continue;
    parent.children.push(item);
    parent.unresolvedChildCount = Math.max(0, parent.item.childCount - parent.children.length);
  }

  return SECTION_DEFINITIONS.flatMap((definition) => {
    const sectionNodes = nodes.filter((node) => nodeSection(node) === definition.id);
    if (sectionNodes.length === 0) return [];

    const grouped = new Map<string, PlanningNode[]>();
    for (const node of sectionNodes) {
      const tag = primaryTag(node.item);
      grouped.set(tag, [...(grouped.get(tag) ?? []), node]);
    }

    const groups = [...grouped.entries()]
      .sort(([left], [right]) => {
        if (left === "Untagged") return 1;
        if (right === "Untagged") return -1;
        return left.localeCompare(right, undefined, { sensitivity: "base" });
      })
      .map(([label, groupedNodes]) => ({ label, nodes: groupedNodes }));

    return [{
      ...definition,
      groups,
      count: sectionNodes.reduce((total, node) => total + 1 + node.children.length, 0),
      epicCount: sectionNodes.filter((node) => node.children.length > 0).length,
    }];
  });
}
