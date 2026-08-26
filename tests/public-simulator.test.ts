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

describe("public simulator DSH fixtures", () => {
  it("keeps DSH configuration and transcript mutations browser-local", async () => {
    const simulator = createPublicSimulator();
    const config = await (await simulator("https://preview.invalid/api/dsh/config")).json() as { readOnly: boolean; presets: Array<{ id: string }> };
    expect(config).toMatchObject({ readOnly: true, presets: [{ id: "dsh-preview-preset" }] });

    const created = await (await simulator("https://preview.invalid/api/dsh/sessions", {
      method: "POST",
      body: JSON.stringify({ presetId: "dsh-preview-preset", workspaceId: "dsh-preview-workspace" }),
    })).json() as { session: { id: string } };
    await simulator(`https://preview.invalid/api/dsh/sessions/${created.session.id}/prompt`, {
      method: "POST",
      body: JSON.stringify({ text: "Inspect the fixture" }),
    });
    const transcript = await (await simulator(`https://preview.invalid/api/dsh/sessions/${created.session.id}`)).json() as { events: Array<{ kind: string; text?: string }> };
    expect(transcript.events).toContainEqual(expect.objectContaining({ kind: "agent", text: expect.stringContaining("No DSH runtime") }));

    const freshSimulator = createPublicSimulator();
    const freshSessions = await (await freshSimulator("https://preview.invalid/api/dsh/sessions")).json() as { sessions: Array<{ id: string }> };
    expect(freshSessions.sessions.some((session) => session.id === created.session.id)).toBe(false);
  });
});
