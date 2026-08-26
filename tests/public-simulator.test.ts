import { describe, expect, it } from "vitest";

import type { PlanningSnapshot } from "../client/lib/api.js";
import { createPublicSimulator } from "../client/simulator/publicSimulator.js";

describe("public simulator planning fixtures", () => {
  it("exposes a complete deterministic epic hierarchy", async () => {
    const response = await createPublicSimulator()("https://preview.invalid/api/planning/items");
    const snapshot = await response.json() as PlanningSnapshot;

    expect(snapshot.epicsTruncated).toBe(false);
    expect(snapshot.items.every((item) => Number.isInteger(item.childCount)
      && Number.isInteger(item.completedChildCount)
      && (item.parentNumber === null || Number.isInteger(item.parentNumber)))).toBe(true);
    expect(snapshot.items.find((item) => item.number === 153)).toMatchObject({ childCount: 2, completedChildCount: 1 });
    expect(snapshot.items.filter((item) => item.parentNumber === 153).map((item) => item.number)).toEqual([112, 109]);
  });
});
