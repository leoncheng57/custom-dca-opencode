import { describe, expect, it } from "vitest";

import {
  collapseActionGroups,
  extractCommands,
  extractMrUrls,
  formatDurationMs,
  formatRelative,
  mergeEvents,
  runningActivity,
} from "../client/lib/derive.js";
import type { MessageMode, ToolEvent, TranscriptEvent, UserEvent } from "../client/lib/transcript.js";

const at = (n: number) => new Date(1787000000000 + n * 1000).toISOString();

function tool(id: string, over: Partial<ToolEvent> = {}): ToolEvent {
  return {
    kind: "tool",
    id,
    messageId: "m1",
    timestamp: at(1),
    status: "completed",
    name: "bash",
    attachments: [],
    ...over,
  };
}

function agent(id: string, text: string, ts = at(1)): TranscriptEvent {
  return { kind: "agent", id, messageId: "m1", timestamp: ts, text };
}

function user(id: string, text: string, mode?: MessageMode): UserEvent {
  return {
    kind: "user",
    id,
    messageId: "m1",
    timestamp: at(1),
    text,
    reminders: [],
    attachments: [],
    ...(mode ? { mode } : {}),
  };
}

describe("mergeEvents", () => {
  it("returns the same reference when nothing changed, so memos hold", () => {
    const prev = [agent("a", "hello")];
    expect(mergeEvents(prev, [agent("a", "hello")])).toBe(prev);
    expect(mergeEvents([], [])).toEqual([]);
  });

  it("removes events absent from the authoritative transcript", () => {
    const previous = [agent("a", "first"), agent("b", "second", at(2))];
    expect(mergeEvents(previous, [agent("b", "second", at(2))]).map((event) => event.id)).toEqual(["b"]);
    expect(mergeEvents(previous, [])).toEqual([]);
  });

  it("detects a same-length content revert", () => {
    const previous = [agent("a", "first")];
    const merged = mergeEvents(previous, [agent("a", "again")]);
    expect((merged[0] as { text: string }).text).toBe("again");
  });

  // The bug this guards against: OpenCode tool parts mutate in place. Treating
  // "is the id new?" as "did anything change?" freezes chips at `running`.
  it("detects a tool transitioning running -> completed", () => {
    const prev = [tool("t1", { status: "running" })];
    const next = mergeEvents(prev, [tool("t1", { status: "completed", output: "done" })]);
    expect(next).not.toBe(prev);
    expect((next[0] as ToolEvent).status).toBe("completed");
  });

  it("detects streaming output growing on the same tool", () => {
    const prev = [tool("t1", { status: "running", output: "part" })];
    const next = mergeEvents(prev, [tool("t1", { status: "running", output: "partial output" })]);
    expect(next).not.toBe(prev);
    expect((next[0] as ToolEvent).output).toBe("partial output");
  });

  it("detects an error appearing", () => {
    const prev = [tool("t1", { status: "running" })];
    const next = mergeEvents(prev, [tool("t1", { status: "error", error: "boom" })]);
    expect(next).not.toBe(prev);
  });

  it("sorts chronologically with a stable tiebreak", () => {
    const merged = mergeEvents(
      [agent("b", "second", at(2))],
      [agent("a", "first", at(1)), agent("b", "second", at(2)), agent("c", "same", at(2))],
    );
    expect(merged.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("lets incoming replace an existing event", () => {
    const merged = mergeEvents([agent("a", "old")], [agent("a", "much newer text")]);
    expect((merged[0] as { text: string }).text).toBe("much newer text");
  });

  // A first sight of a message can arrive without the metadata that classifies
  // it. Without mode in the fingerprint the row would render neutral forever.
  it("replaces a neutral row when a later fetch establishes its mode", () => {
    const neutralUser = [user("u1", "same text")];
    const classifiedUser = mergeEvents(neutralUser, [user("u1", "same text", "plan")]);
    expect(classifiedUser).not.toBe(neutralUser);
    expect((classifiedUser[0] as UserEvent).mode).toBe("plan");

    const planAgent: TranscriptEvent = { ...(agent("a1", "same text") as TranscriptEvent), mode: "plan" };
    const buildAgent: TranscriptEvent = { ...(agent("a1", "same text") as TranscriptEvent), mode: "build" };
    const corrected = mergeEvents([planAgent], [buildAgent]);
    expect(corrected[0]).toBe(buildAgent);
  });

  it("still holds the reference when mode and text are both unchanged", () => {
    const previous = [user("u1", "same text", "build")];
    expect(mergeEvents(previous, [user("u1", "same text", "build")])).toBe(previous);
  });

  it("preserves unchanged row identity when a sibling changes", () => {
    const unchanged = agent("a", "stable", at(1));
    const previous = [unchanged, agent("b", "old", at(2))];
    const merged = mergeEvents(previous, [agent("a", "stable", at(1)), agent("b", "new text", at(2))]);

    expect(merged).not.toBe(previous);
    expect(merged[0]).toBe(unchanged);
    expect(merged[1]).not.toBe(previous[1]);
  });
});

describe("collapseActionGroups", () => {
  it("folds consecutive completed calls into one group", () => {
    const items = collapseActionGroups([tool("t1"), tool("t2"), tool("t3")]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("actionGroup");
    expect((items[0] as { calls: ToolEvent[] }).calls).toHaveLength(3);
  });

  it("keys the group on the first call so expand state survives growth", () => {
    const two = collapseActionGroups([tool("t1"), tool("t2")]);
    const three = collapseActionGroups([tool("t1"), tool("t2"), tool("t3")]);
    expect(two[0].id).toBe("group-t1");
    expect(three[0].id).toBe("group-t1");
  });

  it("never hides errors or in-flight calls", () => {
    const items = collapseActionGroups([
      tool("ok1"),
      tool("bad", { status: "error", error: "x" }),
      tool("ok2"),
      tool("busy", { status: "running" }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["ok1", "bad", "ok2", "busy"]);
    expect(items.every((i) => i.type === "event")).toBe(true);
  });

  it("keeps task cards visible even when exact child metadata is unavailable", () => {
    const items = collapseActionGroups([
      tool("ok1"),
      tool("task", { name: "task" }),
      tool("ok2"),
    ]);
    expect(items.map((item) => item.id)).toEqual(["ok1", "task", "ok2"]);
    expect(items.every((item) => item.type === "event")).toBe(true);
  });

  it("leaves a single call ungrouped", () => {
    const items = collapseActionGroups([tool("t1"), agent("a", "hi")]);
    expect(items.map((i) => i.type)).toEqual(["event", "event"]);
  });

  it("flushes a trailing run", () => {
    const items = collapseActionGroups([agent("a", "hi"), tool("t1"), tool("t2")]);
    expect(items.map((i) => i.type)).toEqual(["event", "actionGroup"]);
  });
});

describe("runningActivity", () => {
  it("reports the in-flight tool", () => {
    const activity = runningActivity([
      tool("t1"),
      tool("t2", { status: "running", detail: "npm test", name: "bash" }),
    ]);
    expect(activity).toMatchObject({ kind: "tool", name: "bash", detail: "npm test" });
  });

  it("ignores status separators when looking backwards", () => {
    const activity = runningActivity([
      tool("t1", { status: "running", detail: "npm test" }),
      { kind: "status", id: "s1", messageId: "m1", timestamp: at(2), label: "Compacted" },
    ]);
    expect(activity.kind).toBe("tool");
  });

  // A stale unfinished call deeper in history is not what's happening now.
  it("does not resurrect an old unfinished call", () => {
    const activity = runningActivity([tool("t1", { status: "running" }), agent("a", "done")]);
    expect(activity.kind).toBe("thinking");
  });

  it("falls back to thinking with the newest timestamp", () => {
    const activity = runningActivity([agent("a", "x", at(1)), agent("b", "y", at(5))]);
    expect(activity).toEqual({ kind: "thinking", since: at(5) });
  });
});

describe("extractCommands", () => {
  it("categorises by tool name", () => {
    const entries = extractCommands([
      tool("a", { name: "bash", detail: "ls" }),
      tool("b", { name: "edit", detail: "src/x.ts" }),
      tool("c", { name: "read", detail: "src/y.ts" }),
      tool("d", { name: "mystery_tool", detail: "?" }),
    ]);
    expect(entries.map((e) => e.category)).toEqual(["command", "edit", "read", "other"]);
  });

  it("maps tool status onto audit status", () => {
    const entries = extractCommands([
      tool("a", { detail: "x", status: "completed" }),
      tool("b", { detail: "x", status: "error" }),
      tool("c", { detail: "x", status: "running" }),
    ]);
    expect(entries.map((e) => e.status)).toEqual(["ok", "error", "pending"]);
  });

  it("skips calls with nothing to show", () => {
    expect(extractCommands([tool("a")])).toHaveLength(0);
  });

  it("previews the first non-empty output line, capped", () => {
    const [entry] = extractCommands([
      tool("a", { detail: "ls", output: "\n\n  first line  \nsecond" }),
    ]);
    expect(entry.outputPreview).toBe("first line");
  });

  // The id must match the transcript row anchor or jump-to-event no-ops.
  it("uses the event id as the jump anchor", () => {
    const [entry] = extractCommands([tool("anchor-me", { detail: "ls" })]);
    expect(entry.id).toBe("anchor-me");
  });
});

describe("extractMrUrls", () => {
  it("finds GitLab MRs on any host and GitHub PRs", () => {
    const urls = extractMrUrls([
      agent("a", "See https://gitlab.example.com/g/p/-/merge_requests/42 for details"),
      tool("t", { output: "opened https://github.com/o/r/pull/7" }),
    ]);
    expect(urls).toEqual([
      "https://gitlab.example.com/g/p/-/merge_requests/42",
      "https://github.com/o/r/pull/7",
    ]);
  });

  it("stops at the iid, ignoring tab segments and query strings", () => {
    const urls = extractMrUrls([agent("a", "https://gl.io/g/p/-/merge_requests/9/diffs?x=1")]);
    expect(urls).toEqual(["https://gl.io/g/p/-/merge_requests/9"]);
  });

  it("terminates correctly inside a markdown link", () => {
    const urls = extractMrUrls([agent("a", "[MR](https://gl.io/g/p/-/merge_requests/3)")]);
    expect(urls).toEqual(["https://gl.io/g/p/-/merge_requests/3"]);
  });

  it("dedupes while preserving first-seen order", () => {
    const urls = extractMrUrls([
      agent("a", "https://gl.io/g/p/-/merge_requests/2"),
      agent("b", "https://gl.io/g/p/-/merge_requests/1"),
      agent("c", "https://gl.io/g/p/-/merge_requests/2"),
    ]);
    expect(urls).toEqual([
      "https://gl.io/g/p/-/merge_requests/2",
      "https://gl.io/g/p/-/merge_requests/1",
    ]);
  });
});

describe("formatters", () => {
  it("formats durations across the minute boundary", () => {
    expect(formatDurationMs(250)).toBe("250ms");
    expect(formatDurationMs(3200)).toBe("3.2s");
    expect(formatDurationMs(125_000)).toBe("2m 05s");
    expect(formatDurationMs(undefined)).toBeNull();
    expect(formatDurationMs(-1)).toBeNull();
  });

  it("formats relative times", () => {
    const now = Date.parse(at(100));
    expect(formatRelative(at(100), now)).toBe("just now");
    expect(formatRelative(at(70), now)).toBe("30s ago");
    expect(formatRelative(at(-100), now)).toBe("3m ago");
    expect(formatRelative("not-a-date", now)).toBe("");
  });
});
