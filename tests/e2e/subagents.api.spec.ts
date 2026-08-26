import { expect, test } from "@playwright/test";

// API tier for the sub-agent ledger. Two things matter here that a UI test
// cannot show: the derived states are computed by the BFF, and the child
// endpoints must refuse to act on a session that is not actually a child of
// the parent in the path.

const DIR = process.platform === "darwin" ? "/private/tmp/mock-subagent-project" : "/tmp/mock-subagent-project";
const MAIN_DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const PARENT = "ses_mock_parent";
const CHILD_RUNNING = "ses_mock_child_running";
const CHILD_DONE = "ses_mock_child_done";
const CHILD_REPORTED = "ses_mock_child_reported";
const CHILD_UNKNOWN = "ses_mock_child_unknown";
const CHILD_FAILED = "ses_mock_child_failed";
const CHILD_LAUNCHED = "ses_mock_child_launched";

const scoped = (path: string, directory = DIR) => `/api${path}?directory=${encodeURIComponent(directory)}`;

interface Task {
  sessionID: string;
  state: string;
  evidence: string;
  background: boolean;
  present: boolean;
  agent?: string;
  description?: string;
  origin?: string;
  model?: { providerID: string; modelID: string };
}

test.describe("GET /api/sessions/:id/subagents", () => {
  test("derives a state and its evidence for every child", async ({ request }) => {
    const response = await request.get(scoped(`/sessions/${PARENT}/subagents`));
    expect(response.status()).toBe(200);
    const body = await response.json() as { tasks: Task[]; capabilities: { backgroundSubagents: boolean } };

    const byId = new Map(body.tasks.map((task) => [task.sessionID, task]));
    expect(byId.size).toBe(6);
    expect(byId.get(CHILD_RUNNING)).toMatchObject({ state: "running", evidence: "session-status" });
    expect(byId.get(CHILD_DONE)).toMatchObject({ state: "completed", evidence: "child-transcript" });
    // Native rows carry the model the task tool resolved, as provenance (#90).
    expect(byId.get(CHILD_DONE)).toMatchObject({
      origin: "native-task",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
    });
    // Its own last turn never finished; only the parent's hand-back settles it.
    expect(byId.get(CHILD_REPORTED)).toMatchObject({ state: "completed", evidence: "parent-completion" });
    // The parent's task part reports "completed" for this one, but it was a
    // background launch: that only means the launch call returned.
    expect(byId.get(CHILD_UNKNOWN)).toMatchObject({
      state: "unknown",
      evidence: "no-terminal-evidence",
      background: true,
    });
    expect(byId.get(CHILD_FAILED)).toMatchObject({
      state: "failed",
      evidence: "child-transcript",
    });
    expect(byId.get(CHILD_LAUNCHED)).toMatchObject({
      state: "launched",
      evidence: "launch-only",
    });
    expect(body.capabilities.backgroundSubagents).toBe(true);
  });

  test("carries delegation intent from the parent transcript", async ({ request }) => {
    const body = await (await request.get(scoped(`/sessions/${PARENT}/subagents`))).json() as { tasks: Task[] };
    const task = body.tasks.find((item) => item.sessionID === CHILD_DONE);
    expect(task).toMatchObject({ agent: "explore", description: "Check the tests", present: true });
  });

  test("returns an empty ledger for a session that delegated nothing", async ({ request }) => {
    const body = await (await request.get(scoped(`/sessions/${CHILD_RUNNING}/subagents`))).json() as { tasks: Task[] };
    expect(body.tasks).toEqual([]);
  });

  test("reports a sub-agent's own sub-agents, so nested work stays inspectable", async ({ request }) => {
    const body = await (await request.get(scoped(`/sessions/${CHILD_DONE}/subagents`))).json() as { tasks: Task[] };
    expect(body.tasks.map((task) => task.sessionID)).toEqual(["ses_mock_grandchild"]);
    expect(body.tasks[0]).toMatchObject({ state: "completed", evidence: "child-transcript" });
  });

  test("requires a directory scope", async ({ request }) => {
    expect((await request.get(`/api/sessions/${PARENT}/subagents`)).status()).toBe(400);
  });

  test("reports an unknown session as not found", async ({ request }) => {
    expect((await request.get(scoped("/sessions/ses_missing/subagents"))).status()).toBe(404);
  });
});

test.describe("child abort authorization", () => {
  test("stops a genuine child of the parent in the path", async ({ request }) => {
    const response = await request.post(scoped(`/sessions/${PARENT}/subagents/${CHILD_RUNNING}/abort`));
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ aborted: true });
  });

  test("refuses a session that is not a child of that parent", async ({ request }) => {
    // Upstream would happily abort this id; the parent link is the check.
    const response = await request.post(scoped(`/sessions/${CHILD_DONE}/subagents/${CHILD_RUNNING}/abort`));
    expect(response.status()).toBe(404);
  });

  test("refuses a child addressed through the wrong project", async ({ request }) => {
    const response = await request.post(
      scoped(`/sessions/${PARENT}/subagents/${CHILD_RUNNING}/abort`, MAIN_DIR),
    );
    expect(response.status()).toBe(404);
  });

  test("refuses an unknown child id", async ({ request }) => {
    expect((await request.post(scoped(`/sessions/${PARENT}/subagents/ses_missing/abort`))).status()).toBe(404);
  });
});

test.describe("background promotion", () => {
  test("promotes running synchronous children", async ({ request }) => {
    const response = await request.post(scoped(`/sessions/${PARENT}/background`));
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ promoted: true });
  });

  test("reports a conflict when nothing is eligible", async ({ request }) => {
    const response = await request.post(scoped(`/sessions/${CHILD_DONE}/background`));
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("background") });
  });
});
