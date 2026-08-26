import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PLANNING_VIEW,
  loadPlanningView,
  normalizePlanningView,
  PLANNING_VIEW_LIMITS,
  PLANNING_VIEW_STORAGE_KEY,
  savePlanningView,
} from "../client/lib/planningView.js";

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("planning view normalization", () => {
  it("collapses every epic by default", () => {
    expect(DEFAULT_PLANNING_VIEW).toEqual({ expandedEpics: [] });
  });

  it("rejects anything that is not an object with an array of epics", () => {
    for (const invalid of [null, undefined, 7, "expanded", [], [1, 2], { expandedEpics: null }, { expandedEpics: "1" }, { expandedEpics: 5 }]) {
      expect(normalizePlanningView(invalid)).toEqual({ expandedEpics: [] });
    }
  });

  it("drops entries that are not non-negative safe integers", () => {
    expect(normalizePlanningView({
      expandedEpics: [10, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "12", null, {}, [], 0, 20],
    })).toEqual({ expandedEpics: [10, 0, 20] });
  });

  it("dedupes while preserving first-seen order", () => {
    expect(normalizePlanningView({ expandedEpics: [30, 10, 30, 20, 10] })).toEqual({ expandedEpics: [30, 10, 20] });
  });

  it("caps the list and ignores unknown fields", () => {
    const normalized = normalizePlanningView({
      expandedEpics: Array.from({ length: PLANNING_VIEW_LIMITS.expandedEpics + 50 }, (_, index) => index + 1),
      density: "compact",
    });
    expect(normalized.expandedEpics).toHaveLength(PLANNING_VIEW_LIMITS.expandedEpics);
    expect(normalized.expandedEpics.at(-1)).toBe(PLANNING_VIEW_LIMITS.expandedEpics);
    expect(Object.keys(normalized)).toEqual(["expandedEpics"]);
  });
});

describe("planning view storage", () => {
  it("round-trips through an injected storage under the documented key", () => {
    const storage = fakeStorage();

    expect(savePlanningView({ expandedEpics: [12, 12, -3, 7] }, storage)).toEqual({ expandedEpics: [12, 7] });
    expect(storage.setItem).toHaveBeenCalledWith(PLANNING_VIEW_STORAGE_KEY, JSON.stringify({ expandedEpics: [12, 7] }));
    expect(loadPlanningView(storage)).toEqual({ expandedEpics: [12, 7] });
  });

  it("returns the default for absent and corrupt entries", () => {
    expect(loadPlanningView(fakeStorage())).toEqual({ expandedEpics: [] });
    expect(loadPlanningView(fakeStorage({ [PLANNING_VIEW_STORAGE_KEY]: "{not json" }))).toEqual({ expandedEpics: [] });
    expect(loadPlanningView(fakeStorage({ [PLANNING_VIEW_STORAGE_KEY]: "[1,2,3]" }))).toEqual({ expandedEpics: [] });
  });

  it("returns the default when storage throws on read", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked by privacy settings");
      }),
    };
    expect(loadPlanningView(storage)).toEqual({ expandedEpics: [] });
  });

  it("still returns the normalized state when storage throws on write", () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    };
    expect(savePlanningView({ expandedEpics: [4, 4, 5] }, storage)).toEqual({ expandedEpics: [4, 5] });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
