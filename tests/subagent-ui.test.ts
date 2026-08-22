import { describe, expect, it } from "vitest";

import {
  buildSessionRows,
  isSubagentSession,
  subagentEvidenceLabel,
  summarizeSubagentStates,
  SUBAGENT_STATE_LABELS,
  SUBAGENT_STATE_TONES,
} from "../client/lib/subagents.js";
import { childSessionIdOf, normalizeMessage, subagentNotice } from "../client/lib/events.js";
import { collapseActionGroups } from "../client/lib/derive.js";
import type { SessionSummary, SubagentEvidence, SubagentState } from "../client/lib/api.js";
import type { StatusEvent, ToolEvent } from "../client/lib/transcript.js";

const CHILD = "ses_child_abcdef";

function session(over: Partial<SessionSummary> & { id: string }): SessionSummary {
  return {
    title: over.id,
    directory: "/tmp/p",
    childCount: 0,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    archived: false,
    running: false,
    ...over,
  };
}

describe("buildSessionRows", () => {
  const ids = (rows: ReturnType<typeof buildSessionRows>) => rows.map((row) => [row.session.id, row.depth]);

  it("orders each root immediately before the work it delegated", () => {
    expect(ids(buildSessionRows([
      session({ id: "root" }),
      session({ id: "a", parentID: "root" }),
      session({ id: "b", parentID: "root" }),
      session({ id: "other" }),
    ]))).toEqual([["root", 0], ["a", 1], ["b", 1], ["other", 0]]);
  });

  it("keeps nesting a grandchild instead of dropping it", () => {
    // Sub-agents can delegate further; a one-level grouping loses this row.
    expect(ids(buildSessionRows([
      session({ id: "root" }),
      session({ id: "child", parentID: "root" }),
      session({ id: "grandchild", parentID: "child" }),
    ]))).toEqual([["root", 0], ["child", 1], ["grandchild", 2]]);
  });

  it("keeps the listing order of roots and of each sibling group", () => {
    expect(ids(buildSessionRows([
      session({ id: "z" }),
      session({ id: "z2", parentID: "z" }),
      session({ id: "a" }),
      session({ id: "z1", parentID: "z" }),
    ]))).toEqual([["z", 0], ["z2", 1], ["z1", 1], ["a", 0]]);
  });

  it("promotes an orphan child to a root rather than hiding it", () => {
    // Its parent is archived or lives in another directory. Dropping the row
    // would make the session unreachable from the only page that lists it.
    expect(ids(buildSessionRows([session({ id: "orphan", parentID: "missing" })]))).toEqual([["orphan", 0]]);
  });

  it("emits every session exactly once, including a corrupt parent cycle", () => {
    const sessions = [
      session({ id: "root" }),
      session({ id: "a", parentID: "root" }),
      session({ id: "cycle1", parentID: "cycle2" }),
      session({ id: "cycle2", parentID: "cycle1" }),
    ];
    const rows = buildSessionRows(sessions);
    expect(rows.map((row) => row.session.id).sort()).toEqual(sessions.map((item) => item.id).sort());
  });

  it("handles an empty listing", () => {
    expect(buildSessionRows([])).toEqual([]);
  });
});

describe("isSubagentSession", () => {
  it("is true only for a session with a parent", () => {
    expect(isSubagentSession({ parentID: "root" })).toBe(true);
    expect(isSubagentSession({ parentID: "" })).toBe(false);
    expect(isSubagentSession({})).toBe(false);
  });
});

describe("subagent state presentation", () => {
  it("labels and tones every state", () => {
    const states: SubagentState[] = ["launched", "running", "completed", "failed", "unknown"];
    for (const state of states) {
      expect(SUBAGENT_STATE_LABELS[state]).toBeTruthy();
      expect(SUBAGENT_STATE_TONES[state]).toBeTruthy();
    }
  });

  it("explains every evidence kind", () => {
    const evidence: SubagentEvidence[] = [
      "session-status",
      "child-transcript",
      "parent-completion",
      "parent-task-part",
      "launch-only",
      "no-terminal-evidence",
    ];
    for (const kind of evidence) expect(subagentEvidenceLabel(kind).length).toBeGreaterThan(10);
  });

  it("says plainly that an unknown state may be a cancellation or a restart", () => {
    expect(subagentEvidenceLabel("no-terminal-evidence")).toMatch(/cancelled|restart/i);
  });

  it("summarizes open work ahead of finished work and omits empty states", () => {
    const summary = summarizeSubagentStates([
      { state: "completed" },
      { state: "running" },
      { state: "completed" },
      { state: "unknown" },
    ]);
    expect(summary).toEqual([
      { state: "running", count: 1 },
      { state: "unknown", count: 1 },
      { state: "completed", count: 2 },
    ]);
  });
});

describe("adapter: delegations", () => {
  it("attaches the child session to the tool row that started it", () => {
    const [event] = normalizeMessage({
      info: { id: "m1", role: "assistant", time: { created: 1_000 } },
      parts: [{
        id: "p1",
        messageID: "m1",
        type: "tool",
        tool: "task",
        state: { status: "completed", metadata: { sessionId: CHILD }, input: { description: "look into it" } },
      }],
    });
    expect(event).toMatchObject({ kind: "tool", childSessionId: CHILD });
  });

  it("leaves an ordinary tool row without a child session", () => {
    const [event] = normalizeMessage({
      info: { id: "m1", role: "assistant", time: { created: 1_000 } },
      parts: [{ id: "p1", messageID: "m1", type: "tool", tool: "bash", state: { status: "completed" } }],
    });
    expect(event).not.toHaveProperty("childSessionId");
  });

  it("reads a child session from metadata whatever the launch tool is called", () => {
    expect(childSessionIdOf({ type: "tool", tool: "future_name", state: { metadata: { sessionID: CHILD } } }))
      .toBe(CHILD);
  });
});

describe("adapter: sub-agent hand-back notices", () => {
  const userText = (text: string) => normalizeMessage({
    info: { id: "m2", role: "user", time: { created: 2_000 } },
    parts: [{ id: "p2", messageID: "m2", type: "text", text }],
  });

  it("renders a machine-authored completion as a status row, not a human bubble", () => {
    const [event] = userText(`Background task ${CHILD} completed successfully.`);
    expect(event.kind).toBe("status");
    expect(event as StatusEvent).toMatchObject({
      label: "Sub-agent reported completion",
      childSessionId: CHILD,
    });
    // A success adds nothing beyond the label and the link.
    expect(event).not.toHaveProperty("detail");
  });

  it("keeps the reason on a reported failure", () => {
    const [event] = userText(`Sub-agent ${CHILD} failed: provider error.`);
    expect(event as StatusEvent).toMatchObject({
      label: "Sub-agent reported a failure",
      detail: expect.stringContaining("provider error"),
    });
  });

  it("leaves an ordinary prompt as a user bubble", () => {
    const [event] = userText("Please add a health endpoint and finish the task.");
    expect(event.kind).toBe("user");
  });

  it("leaves a human message that merely mentions a session id alone", () => {
    // A session id with no outcome word settles nothing, and misreading it
    // would attribute a fabricated result to the agent.
    const [event] = userText(`Take a look at ${CHILD} please.`);
    expect(event.kind).toBe("user");
  });

  it("requires all three signals before claiming a notice", () => {
    expect(subagentNotice(`${CHILD} background completed`)).toEqual({
      childSessionId: CHILD,
      outcome: "completed",
    });
    expect(subagentNotice("background task completed")).toBeNull();
    expect(subagentNotice(`${CHILD} completed`)).toBeNull();
    expect(subagentNotice(`${CHILD} background running`)).toBeNull();
  });

  it("reads 'failed to complete' as a failure", () => {
    expect(subagentNotice(`Background task ${CHILD} failed to complete`)?.outcome).toBe("failed");
  });
});

describe("derive: delegations stay visible", () => {
  const tool = (id: string, over: Partial<ToolEvent> = {}): ToolEvent => ({
    kind: "tool",
    id,
    messageId: "m1",
    timestamp: new Date(1_000).toISOString(),
    status: "completed",
    name: "bash",
    attachments: [],
    ...over,
  });

  it("never folds a delegation into a collapsed action group", () => {
    const items = collapseActionGroups([
      tool("a"),
      tool("b", { name: "task", childSessionId: CHILD }),
      tool("c"),
    ]);
    // Two plain calls separated by a delegation cannot form a group of two.
    expect(items.map((item) => item.type)).toEqual(["event", "event", "event"]);
  });

  it("still groups ordinary consecutive calls", () => {
    const items = collapseActionGroups([tool("a"), tool("b"), tool("c")]);
    expect(items.map((item) => item.type)).toEqual(["actionGroup"]);
  });
});
