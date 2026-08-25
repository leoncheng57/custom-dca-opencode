import type { PlanningItem } from "./api.js";

export type PlanningPriority = "high" | "medium" | "low";
export type PlanningSectionId = "conflict" | PlanningPriority | "none";

export interface PlanningTagGroup {
  label: string;
  items: PlanningItem[];
}

export interface PlanningSection {
  id: PlanningSectionId;
  title: string;
  subtitle: string;
  defaultOpen: boolean;
  groups: PlanningTagGroup[];
  count: number;
}

const PRIORITY_LABELS: Record<PlanningPriority, string> = {
  high: "priority:high",
  medium: "priority:medium",
  low: "priority:low",
};

const SECTION_DEFINITIONS: Array<Omit<PlanningSection, "groups" | "count">> = [
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
  return (Object.keys(PRIORITY_LABELS) as PlanningPriority[])
    .filter((priority) => labels.has(PRIORITY_LABELS[priority]));
}

function primaryTag(item: PlanningItem): string {
  return item.labels
    .filter((label) => !normalizedLabel(label).startsWith("priority:"))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))[0]
    ?? "Untagged";
}

function itemSection(item: PlanningItem): PlanningSectionId {
  const priorities = planningPriorities(item);
  if (priorities.length > 1) return "conflict";
  return priorities[0] ?? "none";
}

export function groupPlanningItems(items: PlanningItem[]): PlanningSection[] {
  return SECTION_DEFINITIONS.flatMap((definition) => {
    const sectionItems = items.filter((item) => itemSection(item) === definition.id);
    if (sectionItems.length === 0) return [];

    const grouped = new Map<string, PlanningItem[]>();
    for (const item of sectionItems) {
      const tag = primaryTag(item);
      grouped.set(tag, [...(grouped.get(tag) ?? []), item]);
    }

    const groups = [...grouped.entries()]
      .sort(([left], [right]) => {
        if (left === "Untagged") return 1;
        if (right === "Untagged") return -1;
        return left.localeCompare(right, undefined, { sensitivity: "base" });
      })
      .map(([label, groupedItems]) => ({ label, items: groupedItems }));

    return [{ ...definition, groups, count: sectionItems.length }];
  });
}
