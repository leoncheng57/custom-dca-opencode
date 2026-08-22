import { afterEach, describe, expect, it, vi } from "vitest";

import {
  childSessionIdOf,
  childTerminalState,
  collectSyntheticOutcomes,
  collectTaskLaunches,
  deriveSubagentTasks,
  listSubagents,
  SUBAGENT_TRANSCRIPT_PROBE_LIMIT,
  type DeriveSubagentsInput,
  type RawTranscriptMessage,
  type TaskLaunch,
} from "../server/opencode/subagents.js";
import { parseCapabilities, resetCapabilitiesCache } from "../server/opencode/capabilities.js";
import { toSummary, withChildCounts, type SessionSummary } from "../server/opencode/sessions.js";

const CHILD = "ses_child_abcdef";
const OTHER = "ses_child_zzzzzz";

function taskMessage(
  over: {
    sessionId?: string;
    status?: string;
    background?: boolean;
    input?: Record<string, unknown>;
    error?: string;
    start?: number;
    end?: number;
    created?: number;
  } = {},
): RawTranscriptMessage {
  return {
    info: { id: "msg_task", role: "assistant", time: { created: over.created ?? 1_000 } },
    parts: [
      {
        id: "prt_task",
        type: "tool",
        tool: "task",
        state: {
          status: over.status ?? "completed",
          input: over.input ?? { description: "Investigate the flake", subagent_type: "explore" },
          ...(over.error ? { error: over.error } : {}),
          metadata: {
            sessionId: over.sessionId ?? CHILD,
            ...(over.background ? { background: true } : {}),
          },
          time: { start: over.start ?? 1_000, end: over.end ?? 2_000 },
        },
      },
    ],
  };
}

function child(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    ...toSummary({ id: CHILD, title: "Investigate the flake", directory: "/tmp/p", parentID: "ses_parent" }, false),
    ...over,
  };
}

function deriveInput(over: Partial<DeriveSubagentsInput> = {}): DeriveSubagentsInput {
  return {
    parentID: "ses_parent",
    launches: [],
    children: [],
    runningChildIDs: new Set<string>(),
    syntheticOutcomes: new Map(),
    childTerminals: new Map(),
    ...over,
  };
}

function launch(over: Partial<TaskLaunch> = {}): TaskLaunch {
  return {
    sessionID: CHILD,
    background: false,
    status: "completed",
    launchedAt: 1_000,
    updatedAt: 2_000,
    ...over,
  };
}

describe("childSessionIdOf", () => {
  it("reads a delegation from tool metadata regardless of tool name", () => {
    expect(childSessionIdOf({ type: "tool", tool: "renamed_launcher", state: { metadata: { sessionId: CHILD } } }))
      .toBe(CHILD);
    expect(childSessionIdOf({ type: "tool", tool: "task", state: { metadata: { sessionID: CHILD } } }))
      .toBe(CHILD);
  });

  it("ignores a tool call that produced no child", () => {
    expect(childSessionIdOf({ type: "tool", tool: "bash", state: { metadata: { output: "hi" } } })).toBeUndefined();
    expect(childSessionIdOf({ type: "tool", tool: "task", state: {} })).toBeUndefined();
    expect(childSessionIdOf({ type: "tool", tool: "task", state: { metadata: { sessionId: "  " } } })).toBeUndefined();
  });
});

describe("collectTaskLaunches", () => {
  it("captures delegation intent from the task input", () => {
    expect(collectTaskLaunches([taskMessage()])).toEqual([
      {
        sessionID: CHILD,
        description: "Investigate the flake",
        agent: "explore",
        background: false,
        status: "completed",
        error: undefined,
        launchedAt: 1_000,
        updatedAt: 2_000,
      },
    ]);
  });

  it("coalesces resume parts for one child, keeping the first launch and the last status", () => {
    const launches = collectTaskLaunches([
      taskMessage({ status: "running", start: 1_000, end: 1_500 }),
      taskMessage({ status: "completed", start: 5_000, end: 6_000 }),
    ]);
    expect(launches).toHaveLength(1);
    expect(launches[0]).toMatchObject({ status: "completed", launchedAt: 1_000, updatedAt: 6_000 });
  });

  it("keeps a child marked background once any part reports it", () => {
    const launches = collectTaskLaunches([
      taskMessage({ background: true, status: "running" }),
      taskMessage({ status: "completed" }),
    ]);
    expect(launches[0].background).toBe(true);
  });

  it("separates concurrent children and ignores non-delegating tools", () => {
    const launches = collectTaskLaunches([
      taskMessage({ sessionId: CHILD }),
      taskMessage({ sessionId: OTHER }),
      { info: { role: "assistant" }, parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }] },
    ]);
    expect(launches.map((entry) => entry.sessionID).sort()).toEqual([CHILD, OTHER].sort());
  });

  it("falls back to the prompt then the title for a description", () => {
    expect(collectTaskLaunches([taskMessage({ input: { prompt: "Do   the\nthing" } })])[0].description)
      .toBe("Do the thing");
  });
});

describe("collectSyntheticOutcomes", () => {
  const notice = (text: string, role = "user"): RawTranscriptMessage => ({
    info: { id: "msg_notice", role, time: { created: 9_000 } },
    parts: [{ type: "text", text }],
  });

  it("reads a hand-back that names a known child and an outcome", () => {
    const outcomes = collectSyntheticOutcomes([notice(`Background task ${CHILD} completed.`)], [CHILD]);
    expect(outcomes.get(CHILD)).toMatchObject({ outcome: "completed" });
  });

  it("classifies failure ahead of completion so 'failed to complete' is not a success", () => {
    const outcomes = collectSyntheticOutcomes([notice(`Task ${CHILD} failed to complete.`)], [CHILD]);
    expect(outcomes.get(CHILD)?.outcome).toBe("failed");
  });

  it("ignores a message that names a child but claims no outcome", () => {
    expect(collectSyntheticOutcomes([notice(`Please look at ${CHILD} when you can.`)], [CHILD]).size).toBe(0);
  });

  it("ignores assistant prose and unknown session ids", () => {
    expect(collectSyntheticOutcomes([notice(`${CHILD} completed`, "assistant")], [CHILD]).size).toBe(0);
    expect(collectSyntheticOutcomes([notice(`${OTHER} completed`)], [CHILD]).size).toBe(0);
  });
});

describe("childTerminalState", () => {
  it("reads completion from the child's own last assistant turn", () => {
    expect(childTerminalState([
      { info: { role: "user", time: { created: 1 } } },
      { info: { role: "assistant", time: { created: 2, completed: 3 } } },
    ])).toEqual({ state: "completed" });
  });

  it("reads a failure and its message", () => {
    expect(childTerminalState([
      { info: { role: "assistant", time: { created: 2 }, error: { message: "provider refused" } } },
    ])).toEqual({ state: "failed", detail: "provider refused" });
  });

  it("returns null for an assistant turn that never finished", () => {
    expect(childTerminalState([{ info: { role: "assistant", time: { created: 2 } } }])).toBeNull();
  });

  it("returns null when the child has no assistant turn at all", () => {
    expect(childTerminalState([{ info: { role: "user", time: { created: 1 } } }])).toBeNull();
    expect(childTerminalState([])).toBeNull();
  });
});

describe("deriveSubagentTasks", () => {
  it("prefers observed liveness over every inference below it", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      launches: [launch({ status: "completed" })],
      children: [child()],
      runningChildIDs: new Set([CHILD]),
      childTerminals: new Map([[CHILD, { state: "completed" as const }]]),
    }));
    expect(task).toMatchObject({ state: "running", evidence: "session-status" });
  });

  it("prefers the child's own transcript over a parent notice", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      launches: [launch()],
      children: [child()],
      childTerminals: new Map([[CHILD, { state: "failed" as const, detail: "child blew up" }]]),
      syntheticOutcomes: new Map([[CHILD, { outcome: "completed" as const, at: 1 }]]),
    }));
    expect(task).toMatchObject({ state: "failed", evidence: "child-transcript", detail: "child blew up" });
  });

  it("uses a parent hand-back when the child transcript settles nothing", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      launches: [launch({ background: true })],
      children: [child()],
      childTerminals: new Map([[CHILD, null]]),
      syntheticOutcomes: new Map([[CHILD, { outcome: "completed" as const, detail: "all done", at: 1 }]]),
    }));
    expect(task).toMatchObject({ state: "completed", evidence: "parent-completion", detail: "all done" });
  });

  it("trusts a SYNCHRONOUS task part that completed, because the call blocked on the child", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      launches: [launch({ background: false, status: "completed" })],
      children: [child()],
      childTerminals: new Map([[CHILD, null]]),
    }));
    expect(task).toMatchObject({ state: "completed", evidence: "parent-task-part" });
  });

  it("refuses to read a completed BACKGROUND launch as a finished child", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      launches: [launch({ background: true, status: "completed" })],
      children: [child()],
      childTerminals: new Map([[CHILD, null]]),
    }));
    // The launch call returned; the child's fate is genuinely unknown.
    expect(task).toMatchObject({ state: "unknown", evidence: "no-terminal-evidence" });
  });

  it("reports a launch that itself errored as failed", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      launches: [launch({ status: "error", error: "could not spawn" })],
      children: [child()],
    }));
    expect(task).toMatchObject({ state: "failed", evidence: "parent-task-part", detail: "could not spawn" });
  });

  it("reports a still-open launch with no reply as launched", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      launches: [launch({ status: "running" })],
      children: [child()],
      childTerminals: new Map([[CHILD, null]]),
    }));
    expect(task).toMatchObject({ state: "launched", evidence: "launch-only" });
  });

  it("reports a silently cancelled child as unknown rather than guessing", () => {
    const [task] = deriveSubagentTasks(deriveInput({
      children: [child()],
      childTerminals: new Map([[CHILD, null]]),
    }));
    expect(task).toMatchObject({ state: "unknown", evidence: "no-terminal-evidence" });
  });

  it("keeps a launched child that no longer exists upstream, flagged as absent", () => {
    const [task] = deriveSubagentTasks(deriveInput({ launches: [launch({ status: "running" })] }));
    expect(task).toMatchObject({ sessionID: CHILD, present: false, title: "Sub-agent session" });
  });

  it("includes a child that was never announced by a task part", () => {
    const tasks = deriveSubagentTasks(deriveInput({
      children: [child({ id: OTHER, title: "Orphan child" })],
    }));
    expect(tasks.map((task) => task.sessionID)).toEqual([OTHER]);
    expect(tasks[0]).toMatchObject({ present: true, background: false });
  });

  it("keys rows by child session, not by task part, when resume duplicates a launch", () => {
    const launches = collectTaskLaunches([
      taskMessage({ status: "running", start: 1_000 }),
      taskMessage({ status: "running", start: 4_000 }),
    ]);
    expect(deriveSubagentTasks(deriveInput({ launches, children: [child()] }))).toHaveLength(1);
  });

  it("orders newest first", () => {
    const tasks = deriveSubagentTasks(deriveInput({
      children: [
        child({ id: CHILD, createdAt: new Date(1_000).toISOString() }),
        child({ id: OTHER, createdAt: new Date(9_000).toISOString() }),
      ],
    }));
    expect(tasks.map((task) => task.sessionID)).toEqual([OTHER, CHILD]);
  });
});

describe("withChildCounts", () => {
  it("counts children onto their parent and leaves leaves at zero", () => {
    const counted = withChildCounts([
      toSummary({ id: "root", directory: "/tmp/p" }, false),
      toSummary({ id: "a", directory: "/tmp/p", parentID: "root" }, false),
      toSummary({ id: "b", directory: "/tmp/p", parentID: "root" }, false),
      toSummary({ id: "lonely", directory: "/tmp/p" }, false),
    ]);
    expect(counted.map((session) => [session.id, session.childCount])).toEqual([
      ["root", 2], ["a", 0], ["b", 0], ["lonely", 0],
    ]);
  });

  it("does not invent a parent that is absent from the listing", () => {
    const counted = withChildCounts([toSummary({ id: "a", directory: "/tmp/p", parentID: "gone" }, false)]);
    expect(counted[0].childCount).toBe(0);
  });
});

describe("listSubagents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCapabilitiesCache();
  });

  interface StubOptions {
    children?: Array<Record<string, unknown>>;
    status?: Record<string, { type: string }>;
    parentMessages?: RawTranscriptMessage[];
    capabilities?: unknown;
    childMessages?: Record<string, RawTranscriptMessage[]>;
  }

  function stubUpstream(options: StubOptions = {}): { paths: string[] } {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      paths.push(url.pathname);
      const body = (value: unknown) => new Response(JSON.stringify(value));

      if (url.pathname === "/session/status") return body(options.status ?? {});
      if (url.pathname === "/experimental/capabilities") return body(options.capabilities ?? { backgroundSubagents: true });
      if (url.pathname === "/session/ses_parent/children") return body(options.children ?? []);
      if (url.pathname === "/session/ses_parent/message") return body(options.parentMessages ?? []);
      const child = /^\/session\/([^/]+)\/message$/.exec(url.pathname);
      if (child) return body(options.childMessages?.[decodeURIComponent(child[1])] ?? []);
      return new Response("null");
    }));
    return { paths };
  }

  const config = { baseUrl: "http://opencode.test" };

  it("combines the child list, parent intent and child transcript into one ledger", async () => {
    stubUpstream({
      children: [{ id: CHILD, title: "Investigate the flake", directory: "/tmp/p", parentID: "ses_parent" }],
      parentMessages: [taskMessage({ status: "running" })],
      childMessages: { [CHILD]: [{ info: { role: "assistant", time: { created: 1, completed: 2 } } }] },
    });

    const report = await listSubagents(config, "/tmp/p", "ses_parent");
    expect(report.parentID).toBe("ses_parent");
    expect(report.capabilities).toEqual({ backgroundSubagents: true });
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0]).toMatchObject({
      sessionID: CHILD,
      title: "Investigate the flake",
      agent: "explore",
      description: "Investigate the flake",
      state: "completed",
      evidence: "child-transcript",
      present: true,
    });
  });

  it("does not spend a transcript probe on a child the server reports as busy", async () => {
    const { paths } = stubUpstream({
      children: [{ id: CHILD, directory: "/tmp/p", parentID: "ses_parent" }],
      status: { [CHILD]: { type: "busy" } },
    });

    const report = await listSubagents(config, "/tmp/p", "ses_parent");
    expect(report.tasks[0]).toMatchObject({ state: "running", evidence: "session-status" });
    expect(paths).not.toContain(`/session/${CHILD}/message`);
  });

  it("caps child transcript probes and says so", async () => {
    const children = Array.from({ length: SUBAGENT_TRANSCRIPT_PROBE_LIMIT + 5 }, (_, index) => ({
      id: `ses_child_${String(index).padStart(6, "0")}`,
      directory: "/tmp/p",
      parentID: "ses_parent",
    }));
    const { paths } = stubUpstream({ children });

    const report = await listSubagents(config, "/tmp/p", "ses_parent");
    expect(report.tasks).toHaveLength(children.length);
    expect(report.truncated).toBe(true);
    expect(paths.filter((path) => /^\/session\/ses_child_\d+\/message$/.test(path)))
      .toHaveLength(SUBAGENT_TRANSCRIPT_PROBE_LIMIT);
    // Everything unprobed is honestly unknown rather than quietly "completed".
    expect(report.tasks.filter((task) => task.state === "unknown")).toHaveLength(children.length);
  });

  it("degrades to no capability rather than failing when the probe is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/experimental/capabilities") return new Response("nope", { status: 404 });
      if (url.pathname === "/session/ses_parent/children") return new Response("[]");
      return new Response("[]");
    }));

    const report = await listSubagents(config, "/tmp/p", "ses_parent");
    expect(report.capabilities).toEqual({ backgroundSubagents: false });
    expect(report.tasks).toEqual([]);
  });

  it("survives a parent transcript it cannot read", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/session/ses_parent/message") return new Response("boom", { status: 500 });
      if (url.pathname === "/session/ses_parent/children") {
        return new Response(JSON.stringify([{ id: CHILD, directory: "/tmp/p", parentID: "ses_parent" }]));
      }
      return new Response("[]");
    }));

    const report = await listSubagents(config, "/tmp/p", "ses_parent");
    expect(report.tasks.map((task) => task.sessionID)).toEqual([CHILD]);
  });
});

describe("parseCapabilities", () => {
  it("reads the background flag only when it is exactly true", () => {
    expect(parseCapabilities({ backgroundSubagents: true })).toEqual({ backgroundSubagents: true });
    expect(parseCapabilities({ backgroundSubagents: "true" })).toEqual({ backgroundSubagents: false });
  });

  it("treats an absent or malformed probe as no capability", () => {
    for (const value of [undefined, null, "yes", 1, []]) {
      expect(parseCapabilities(value)).toEqual({ backgroundSubagents: false });
    }
  });
});
