import { describe, expect, it } from "vitest";

import type { DshTrajectoryPage, PlanningSnapshot } from "../client/lib/api.js";
import { createPublicSimulator } from "../client/simulator/publicSimulator.js";

describe("public simulator workflow fixtures", () => {
  it("mirrors the six current workflow ids", async () => {
    const response = await createPublicSimulator()("https://preview.invalid/api/workflows");
    const payload = await response.json() as { workflows: Array<{ id: string; injector: string }> };
    expect(payload.workflows.map(({ id }) => id)).toEqual([
      "playwright-ui-review",
      "pr-snippet-review",
      "session-update",
      "managed-child",
      "start-dca-session",
      "design-doc-prototype",
    ]);
    expect(payload.workflows.every(({ injector }) => injector.length > 0)).toBe(true);
  });
});

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
    const config = await (await simulator("https://preview.invalid/api/dsh/config")).json() as { presets: Array<{ id: string; mode: string }> };
    expect(config).toMatchObject({ presets: [{ id: "dsh-preview-preset", mode: "read-only" }] });

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
    const trajectory = await (await simulator(`https://preview.invalid/api/dsh/sessions/${created.session.id}/trajectory`)).json() as DshTrajectoryPage;
    expect(trajectory.coverage).toMatchObject({ source: "dca-captured-projection", complete: false, mayContainGaps: true });
    expect(trajectory.events).toContainEqual(expect.objectContaining({ type: "tool/call", metadata: expect.objectContaining({ callId: "id:callpreview" }) }));
    expect(JSON.stringify(trajectory)).not.toContain("PRIVATE");
    const detail = await simulator(`https://preview.invalid/api/dsh/sessions/${created.session.id}/trajectory/${created.session.id}%3A3/detail`, { method: "POST" });
    expect(detail.status).toBe(403);

    const freshSimulator = createPublicSimulator();
    const freshSessions = await (await freshSimulator("https://preview.invalid/api/dsh/sessions")).json() as { sessions: Array<{ id: string }> };
    expect(freshSessions.sessions.some((session) => session.id === created.session.id)).toBe(false);
  });
});
