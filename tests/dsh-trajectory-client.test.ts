import { describe, expect, it } from "vitest";

import type { DshTrajectoryEvent } from "../client/lib/api.js";
import { deriveDshTrajectoryTiming, filterDshTrajectory, groupDshTrajectory, mergeDshTrajectoryEvents } from "../client/lib/dshTrajectory.js";

function event(input: Partial<DshTrajectoryEvent> & Pick<DshTrajectoryEvent, "id" | "observationSeq" | "category" | "type">): DshTrajectoryEvent {
  return { sessionId: "dsh-test", observedAt: "2026-08-26T00:00:00Z", title: input.type, source: "dsh-native-notification", hasDetail: false, sensitive: false, ...input };
}

describe("DSH trajectory client derivation", () => {
  const events = [
    event({ id: "1", observationSeq: 1, category: "turn", type: "turn/start", metadata: { turn: 2 } }),
    event({ id: "2", observationSeq: 2, category: "tool", type: "tool/call", metadata: { turn: 2, callId: "call-1" } }),
    event({ id: "3", observationSeq: 3, category: "tool", type: "tool/result", metadata: { turn: 2, callId: "call-1" } }),
    event({ id: "4", observationSeq: 4, category: "error", type: "turn/end", metadata: { turn: 2, reason: "error" } }),
  ];

  it("filters only safe projected metadata", () => {
    expect(filterDshTrajectory(events, "tools", "call-1").map((item) => item.id)).toEqual(["2", "3"]);
    expect(filterDshTrajectory(events, "failures", "error").map((item) => item.id)).toEqual(["4"]);
  });

  it("groups by native turn and pairs tools by call id", () => {
    const groups = groupDshTrajectory(events);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Turn 2");
    expect(groups[0].events.filter((item) => item.metadata?.callId === "call-1")).toHaveLength(2);
  });

  it("keeps request metadata inside the active native turn", () => {
    const grouped = groupDshTrajectory([
      event({ id: "start", observationSeq: 1, category: "turn", type: "turn/start", nativeSessionId: "id:root", metadata: { turn: 1 } }),
      event({ id: "request", observationSeq: 2, category: "request", type: "request/header", nativeSessionId: "id:root" }),
      event({ id: "end", observationSeq: 3, category: "turn", type: "turn/end", nativeSessionId: "id:root", metadata: { turn: 1 } }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].events.map((item) => item.id)).toEqual(["start", "request", "end"]);
  });

  it("labels standalone compaction between turns", () => {
    const grouped = groupDshTrajectory([
      event({ id: "compact-start", observationSeq: 1, category: "compaction", type: "compaction/start", metadata: { standalone: true } }),
      event({ id: "compact-summary", observationSeq: 2, category: "compaction", type: "compaction/summary" }),
      event({ id: "compact-end", observationSeq: 3, category: "compaction", type: "compaction/end", metadata: { standalone: true } }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].label).toBe("Between turns");
  });

  it("merges polling and pagination pages by stable event id", () => {
    expect(mergeDshTrajectoryEvents(events.slice(1), events.slice(0, 2)).map((item) => item.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("derives turn and tool-pair timing from native timestamps", () => {
    const timed = events.map((item, index) => ({ ...item, nativeTime: new Date(1_700_000_000_000 + index * 25).toISOString() }));
    const timing = deriveDshTrajectoryTiming(timed);
    expect(timing.get("3")?.durationMs).toBe(25);
    expect(timing.get("4")?.durationMs).toBe(75);
  });
});
