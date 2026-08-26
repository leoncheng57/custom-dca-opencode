// client/lib/planningView.ts
//
// Device-local expand state for the planning page's epics, following the same
// pattern as notificationView: an injectable Storage so this is unit-testable,
// an exported normalizer, and storage failures that degrade to defaults rather
// than throwing on a render path.
//
// This is a display preference, not planning data. Which epics a phone has
// open says nothing about the repository, so it must not become server state.

export const PLANNING_VIEW_STORAGE_KEY = "opencode.planning.view";

/** Bounded so a long session of clicking cannot grow localStorage without limit. */
export const PLANNING_VIEW_LIMITS = { expandedEpics: 200 } as const;

export interface PlanningViewState {
  /** Issue numbers of the epics this device has expanded. */
  expandedEpics: number[];
}

/**
 * Epics start COLLAPSED. Folding a backlog down to its parents is the whole
 * point of the hierarchy, so an empty list is the correct first-visit state.
 */
export const DEFAULT_PLANNING_VIEW: PlanningViewState = { expandedEpics: [] };

export function normalizePlanningView(raw: unknown): PlanningViewState {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const candidates = source.expandedEpics;
  if (!Array.isArray(candidates)) return { expandedEpics: [] };

  const expandedEpics: number[] = [];
  const seen = new Set<number>();
  for (const entry of candidates) {
    const number = typeof entry === "number" ? entry : Number.NaN;
    if (!Number.isSafeInteger(number) || number < 0 || seen.has(number)) continue;
    seen.add(number);
    expandedEpics.push(number);
    if (expandedEpics.length >= PLANNING_VIEW_LIMITS.expandedEpics) break;
  }
  return { expandedEpics };
}

/** Corrupt or blocked storage falls back to the default rather than throwing. */
export function loadPlanningView(storage?: Pick<Storage, "getItem">): PlanningViewState {
  try {
    const raw = (storage ?? localStorage).getItem(PLANNING_VIEW_STORAGE_KEY);
    if (raw === null) return { expandedEpics: [] };
    return normalizePlanningView(JSON.parse(raw));
  } catch {
    return { expandedEpics: [] };
  }
}

export function savePlanningView(
  state: PlanningViewState,
  storage?: Pick<Storage, "setItem">,
): PlanningViewState {
  const normalized = normalizePlanningView(state);
  try {
    (storage ?? localStorage).setItem(PLANNING_VIEW_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be blocked by browser privacy settings; the in-memory view still works.
  }
  return normalized;
}
