import { expect, test, type APIRequestContext } from "@playwright/test";

// API tier — exercises the real BFF against the mock OpenCode server.
// No browser, no agent run.

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const AUTO_DIR = process.platform === "darwin" ? "/private/tmp/mock-auto-project" : "/tmp/mock-auto-project";
const TOOL_FAILURE_DIR = process.platform === "darwin" ? "/private/tmp/mock-tool-failure" : "/tmp/mock-tool-failure";
const CATALOGUE_FAILURE_DIR = process.platform === "darwin" ? "/private/tmp/mock-catalogue-failure" : "/tmp/mock-catalogue-failure";
const POLICY_FAILURE_DIR = process.platform === "darwin" ? "/private/tmp/mock-policy-failure" : "/tmp/mock-policy-failure";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;
const PREVIEW_PORT = process.env.MOCK_PREVIEW_PORT || "4600";

async function promptPayload(text: string): Promise<Record<string, unknown>> {
  const payloads = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  const payload = payloads.find((item) => {
    const parts = item.parts as Array<{ type?: string; text?: string }> | undefined;
    return parts?.some((part) => part.type === "text" && part.text === text);
  });
  expect(payload).toBeDefined();
  return payload!;
}

async function latestSessionPayload(): Promise<Record<string, unknown>> {
  const payloads = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
  expect(payloads.length).toBeGreaterThan(0);
  return payloads.at(-1)!;
}

interface PolicyProbe {
  permission: Array<{ permission: string; pattern: string; action: "allow" | "ask" | "deny" }>;
  disabledTools: string[];
  probes: {
    bashDefault: string;
    bashDestructive: string;
    readEnv: string;
    editEnv: string;
    externalDirectory: string;
    unconfiguredTool: string;
  };
}

async function freshSession(request: APIRequestContext, directory = DIR): Promise<string> {
  const response = await request.post("/api/sessions", { data: { directory, title: `policy ${Date.now()}` } });
  expect(response.status()).toBe(201);
  return (await response.json()).session.id as string;
}

async function policyProbe(sessionID: string): Promise<PolicyProbe> {
  return await (await fetch(`${MOCK_URL}/test/session-policy?id=${encodeURIComponent(sessionID)}`)).json() as PolicyProbe;
}

test.describe("health", () => {
  test("reports upstream reachability and version", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.healthy).toBe(true);
    expect(body.upstream.reachable).toBe(true);
    expect(body.upstream.version).toBe("1.18.21");
    expect(body.upstream.versionMatches).toBe(true);
  });

  test("reports the SSE bus connection", async ({ request }) => {
    const body = await (await request.get("/api/health")).json();
    expect(body.events.connected).toBe(true);
  });
});

test.describe("public app config", () => {
  test("exposes only the configured phone origin", async ({ request }) => {
    const response = await request.get("/api/app-config");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ publicAppUrl: "https://ide.e2e.example.test:8443" });
  });
});

test.describe("project discovery and pins", () => {
  test("discovers local repositories and round-trips canonical ordered pins", async ({ request }) => {
    const discovery = await request.get("/api/projects");
    expect(discovery.ok()).toBe(true);
    const body = await discovery.json();
    expect(body.root).toBe(process.platform === "darwin" ? "/private/tmp" : "/tmp");
    expect(body.projects).toContainEqual(expect.objectContaining({
      name: "mock-project",
      directory: DIR,
      kind: "repository",
    }));

    try {
      const saved = await request.patch("/api/project-pins", { data: { directories: [DIR, DIR] } });
      expect(saved.ok()).toBe(true);
      expect(await saved.json()).toEqual({ directories: [DIR] });
      expect(await (await request.get("/api/project-pins")).json()).toEqual({ directories: [DIR] });
    } finally {
      await request.patch("/api/project-pins", { data: { directories: [] } });
    }
  });

  test("rejects pins outside PROJECTS_DIR", async ({ request }) => {
    const response = await request.patch("/api/project-pins", { data: { directories: ["/usr"] } });
    expect(response.status()).toBe(403);
  });
});

test.describe("directory scoping", () => {
  // One OpenCode server hosts every project. A missing scope would silently
  // target whatever directory the server started in, so it must be rejected.
  test("rejects a missing directory", async ({ request }) => {
    const res = await request.get("/api/sessions");
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("directory");
  });

  test("rejects a relative directory", async ({ request }) => {
    const res = await request.get("/api/sessions?directory=relative/path");
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("absolute");
  });

  test("returns only sessions in the requested directory", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    expect(body.sessions.length).toBeGreaterThan(0);
    for (const session of body.sessions) expect(session.directory).toBe(DIR);
  });

  test("rejects a nonexistent directory before forwarding it", async ({ request }) => {
    const res = await request.get("/api/sessions?directory=/tmp/nope");
    expect(res.status()).toBe(400);
  });
});

test.describe("sessions", () => {
  test("hides archived sessions", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    const ids = body.sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain("ses_mock_done");
    expect(ids).not.toContain("ses_mock_archived");
  });

  test("marks the busy session as running", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    const byId = Object.fromEntries(
      body.sessions.map((s: { id: string; running: boolean }) => [s.id, s.running]),
    );
    expect(byId.ses_mock_running).toBe(true);
    expect(byId.ses_mock_done).toBe(false);
  });

  test("normalises cost and token totals", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    const done = body.sessions.find((s: { id: string }) => s.id === "ses_mock_done");
    expect(done.cost).toBeCloseTo(0.0431);
    expect(done.tokens).toMatchObject({ input: 110, output: 940, cacheRead: 10400 });
  });

  // Upstream answers 500 for an unknown id; a stale bookmark should read as
  // "gone", not "the agent server is broken".
  test("an unknown session is 404, not 502", async ({ request }) => {
    const res = await request.get(`/api/sessions/ses_nope/messages?directory=${DIR}`);
    expect(res.status()).toBe(404);
  });
});

test.describe("model catalogue", () => {
  test("exposes only safe, bounded model metadata", async ({ request }) => {
    const response = await request.get(`/api/models?directory=${DIR}`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.defaultModel).toEqual({ providerID: "anthropic", modelID: "claude-opus-5" });
    expect(body.models).toContainEqual(expect.objectContaining({
      providerID: "anthropic",
      modelID: "claude-opus-5",
      capabilities: { image: true, reasoning: true },
      limits: { context: 200000, output: 32000 },
      variants: ["high"],
    }));
    const serialized = JSON.stringify(body);
    for (const forbidden of ["headers", "options", "apiKey", "baseURL", "must-not-reach-browser", "private.example", "secret"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("fails honestly when discovery is unavailable", async ({ request }) => {
    const response = await request.get(`/api/models?directory=${CATALOGUE_FAILURE_DIR}`);
    expect(response.status()).toBe(502);
    expect((await response.json()).error).toContain("catalogue is unavailable");

    const prompt = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${CATALOGUE_FAILURE_DIR}`, {
      data: { text: "must not route", model: { providerID: "anthropic", modelID: "claude-opus-5" } },
    });
    expect(prompt.status()).toBe(502);
    expect((await prompt.json()).error).toContain("no model selection was sent");
  });
});

test.describe("transcript", () => {
  test("returns raw messages for the client adapter to shape", async ({ request }) => {
    const body = await (await request.get(`/api/sessions/ses_mock_done/messages?directory=${DIR}`)).json();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThan(0);
    expect(body.messages[0]).toHaveProperty("info");
    expect(body.messages[0]).toHaveProperty("parts");
  });

  test("serves todos", async ({ request }) => {
    const body = await (await request.get(`/api/sessions/ses_mock_done/todos?directory=${DIR}`)).json();
    expect(body.todos.length).toBe(3);
    expect(body.todos[0]).toMatchObject({ status: "completed" });
  });
});

test.describe("question requests", () => {
  test.beforeEach(async () => {
    await fetch(`${MOCK_URL}/test/questions/reset?scope=api`, { method: "POST" });
  });

  test("returns only the addressed session's questions", async ({ request }) => {
    const response = await request.get(`/api/sessions/ses_mock_running/questions?directory=${DIR}`);
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    expect(payload.requests.map((item: { id: string }) => item.id)).toEqual(["que_api"]);
    expect(payload.requests[0].questions).toHaveLength(2);
  });

  test("preserves ordered answer arrays and rejects cross-session mutations", async ({ request }) => {
    const crossSession = await request.post(`/api/sessions/ses_mock_running/questions/que_mock/reject?directory=${DIR}`);
    expect(crossSession.status()).toBe(404);

    const response = await request.post(`/api/sessions/ses_mock_running/questions/que_api/reply?directory=${DIR}`, {
      data: { answers: [["Staging"], ["Unit", "E2E"]] },
    });
    expect(response.ok()).toBe(true);
    const replies = await (await fetch(`${MOCK_URL}/test/question-replies?id=que_api`)).json() as Array<Record<string, unknown>>;
    expect(replies).toEqual([{ id: "que_api", answers: [["Staging"], ["Unit", "E2E"]] }]);

    const stale = await request.post(`/api/sessions/ses_mock_running/questions/que_api/reject?directory=${DIR}`);
    expect(stale.status()).toBe(404);
  });

  test("validates the answer matrix", async ({ request }) => {
    const response = await request.post(`/api/sessions/ses_mock_running/questions/que_api/reply?directory=${DIR}`, {
      data: { answers: [["Staging"]] },
    });
    expect(response.status()).toBe(400);

    const multipleForSingle = await request.post(`/api/sessions/ses_mock_running/questions/que_api/reply?directory=${DIR}`, {
      data: { answers: [["Staging", "Production"], ["Unit"]] },
    });
    expect(multipleForSingle.status()).toBe(400);
  });

  test("rejects an owned question", async ({ request }) => {
    const response = await request.post(`/api/sessions/ses_mock_running/questions/que_api/reject?directory=${DIR}`);
    expect(response.ok()).toBe(true);
    expect(await (await fetch(`${MOCK_URL}/test/question-replies?id=que_api`)).json()).toEqual([{ id: "que_api", rejected: true }]);
  });
});

test.describe("prompting", () => {
  test("accepts a prompt asynchronously (202, not a held connection)", async ({ request }) => {
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "hello" },
    });
    expect(res.status()).toBe(202);
    expect((await res.json()).accepted).toBe(true);
  });

  test("rejects an empty prompt", async ({ request }) => {
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "   " },
    });
    expect(res.status()).toBe(400);
  });

  test("recovers Build tools in the same session after Plan without weakening configured policy", async ({ request }) => {
    const sessionID = await freshSession(request);
    const planText = `plan api ${Date.now()}`;
    const res = await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: planText, mode: "plan" },
    });
    expect(res.status()).toBe(202);
    const payload = await promptPayload(planText);
    expect(payload.agent).toBe("plan");
    expect(payload).not.toHaveProperty("tools");
    const planned = await policyProbe(sessionID);
    expect(planned.disabledTools).toEqual(expect.arrayContaining(["bash", "edit", "write", "apply_patch"]));

    const repeatedPlan = `plan repeated ${Date.now()}`;
    expect((await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: repeatedPlan, mode: "plan" },
    })).status()).toBe(202);
    expect((await policyProbe(sessionID)).permission).toHaveLength(planned.permission.length);

    const legacy = await fetch(`${MOCK_URL}/session/${sessionID}/prompt_async?directory=${encodeURIComponent(DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "plan",
        tools: { read: true, bash: false, edit: false, write: false, apply_patch: false },
        parts: [{ type: "text", text: `legacy plan ${Date.now()}` }],
      }),
    });
    expect(legacy.status).toBe(204);
    expect((await policyProbe(sessionID)).probes.readEnv).toBe("allow");

    const buildText = `build api ${Date.now()}`;
    const build = await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: buildText, mode: "build" },
    });
    expect(build.status()).toBe(202);
    expect(await promptPayload(buildText)).toMatchObject({ agent: "build" });
    const restored = await policyProbe(sessionID);
    for (const tool of ["bash", "edit", "write", "apply_patch"]) {
      expect(restored.disabledTools).not.toContain(tool);
    }
    expect(restored.probes).toEqual({
      bashDefault: "ask",
      bashDestructive: "deny",
      readEnv: "deny",
      editEnv: "deny",
      externalDirectory: "ask",
      unconfiguredTool: "ask",
    });
    expect(restored.permission).not.toContainEqual({ permission: "*", pattern: "*", action: "allow" });

    const repeatedBuild = `build repeated ${Date.now()}`;
    expect((await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: repeatedBuild, mode: "build" },
    })).status()).toBe(202);
    expect((await policyProbe(sessionID)).permission).toHaveLength(restored.permission.length);
  });

  test("keeps Plan session policy activation independent from auto permissions", async ({ request }) => {
    const sessionID = await freshSession(request);
    const text = `plan auto api ${Date.now()}`;
    await request.patch(`/api/auto-approve?directory=${DIR}`, { data: { enabled: true } });
    try {
      const response = await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
        data: { text, mode: "plan" },
      });
      expect(response.status()).toBe(202);
      expect(await promptPayload(text)).toMatchObject({ agent: "plan" });
      expect(await promptPayload(text)).not.toHaveProperty("tools");
      expect((await policyProbe(sessionID)).disabledTools)
        .toEqual(expect.arrayContaining(["bash", "edit", "write", "apply_patch"]));
      expect(await (await request.get(`/api/auto-approve?directory=${DIR}`)).json())
        .toEqual({ enabled: true, error: null });
    } finally {
      await request.patch(`/api/auto-approve?directory=${DIR}`, { data: { enabled: false } });
    }
  });

  test("supports Build to Plan on one session", async ({ request }) => {
    const sessionID = await freshSession(request);
    expect((await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: `build first ${Date.now()}`, mode: "build" },
    })).status()).toBe(202);
    expect((await policyProbe(sessionID)).permission).toEqual([]);

    expect((await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: `plan second ${Date.now()}`, mode: "plan" },
    })).status()).toBe(202);
    expect((await policyProbe(sessionID)).disabledTools).toEqual(expect.arrayContaining(["bash", "edit", "write", "apply_patch"]));
  });

  test("serializes concurrent opposite-mode policy activation with prompt delivery", async ({ request }) => {
    const sessionID = await freshSession(request);
    await fetch(`${MOCK_URL}/test/hold-next-policy-patch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionID }),
    });

    const planText = `concurrent plan ${Date.now()}`;
    const planRequest = request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: planText, mode: "plan" },
    });
    await expect.poll(async () => {
      const response = await fetch(`${MOCK_URL}/test/policy-patch-pending?id=${encodeURIComponent(sessionID)}`);
      return ((await response.json()) as { pending: boolean }).pending;
    }).toBe(true);

    const buildText = `concurrent build ${Date.now()}`;
    const buildRequest = request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: buildText, mode: "build" },
    });
    const buildState = await Promise.race([
      buildRequest.then(() => "completed" as const),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 200)),
    ]);
    await fetch(`${MOCK_URL}/test/release-policy-patch?id=${encodeURIComponent(sessionID)}`, { method: "POST" });
    expect(buildState).toBe("blocked");
    const [planResponse, buildResponse] = await Promise.all([planRequest, buildRequest]);
    expect(planResponse.status()).toBe(202);
    expect(buildResponse.status()).toBe(202);

    const planPolicy = (await promptPayload(planText)).effectivePolicy as PolicyProbe;
    expect(planPolicy.disabledTools).toEqual(expect.arrayContaining(["bash", "edit", "write", "apply_patch"]));
    const buildPolicy = (await promptPayload(buildText)).effectivePolicy as PolicyProbe;
    for (const tool of ["bash", "edit", "write", "apply_patch"]) {
      expect(buildPolicy.disabledTools).not.toContain(tool);
    }
  });

  test("leaves a direct Build session on its resolved agent policy", async ({ request }) => {
    const sessionID = await freshSession(request);
    expect((await request.post(`/api/sessions/${sessionID}/prompt?directory=${DIR}`, {
      data: { text: `direct build ${Date.now()}`, mode: "build" },
    })).status()).toBe(202);
    const policy = await policyProbe(sessionID);
    expect(policy.permission).toEqual([]);
    expect(policy.probes).toMatchObject({ bashDefault: "ask", bashDestructive: "deny", editEnv: "deny" });
  });

  test("validates model switches and preserves the prompt_async model shape", async ({ request }) => {
    const text = `switch model ${Date.now()}`;
    const response = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text, mode: "plan", model: { providerID: "openai", modelID: "gpt-5" } },
    });
    expect(response.status()).toBe(202);
    const payload = await promptPayload(text);
    expect(payload).toMatchObject({ agent: "plan", model: { providerID: "openai", modelID: "gpt-5" } });
    expect(payload).not.toHaveProperty("tools");

    for (const model of [
      { providerID: "openai", modelID: "guessed" },
      { providerID: "anthropic", modelID: "claude-retired" },
      "anthropic/claude-opus-5",
    ]) {
      const rejected = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
        data: { text: "must not send", model },
      });
      expect(rejected.status()).toBe(400);
    }
  });

  test("validates variants and sends Plan, model, and variant together", async ({ request }) => {
    const text = `variant plan ${Date.now()}`;
    const response = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: {
        text,
        mode: "plan",
        model: { providerID: "anthropic", modelID: "claude-opus-5", variant: "high" },
      },
    });
    expect(response.status()).toBe(202);
    const payload = await promptPayload(text);
    expect(payload).toMatchObject({
      agent: "plan",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
      variant: "high",
    });
    expect(payload).not.toHaveProperty("tools");

    for (const model of [
      { providerID: "anthropic", modelID: "claude-opus-5", variant: "invented" },
      { providerID: "anthropic", modelID: "claude-opus-5", variant: "" },
      { providerID: "anthropic", modelID: "claude-opus-5", token: "leak" },
    ]) {
      const rejected = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
        data: { text: "must not send", model },
      });
      expect(rejected.status()).toBe(400);
    }
  });

  test("fails closed when Plan tool discovery is unavailable", async ({ request }) => {
    const text = `blocked plan ${Date.now()}`;
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${TOOL_FAILURE_DIR}`, {
      data: { text, mode: "plan" },
    });
    expect(res.status()).toBe(502);
    expect((await res.json()).error).toContain("Plan policy; prompt was not sent");
    const payloads = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
    expect(payloads.some((item) => JSON.stringify(item).includes(text))).toBe(false);
  });

  test("surfaces policy activation failure without calling prompt_async", async ({ request }) => {
    const sessionID = await freshSession(request, POLICY_FAILURE_DIR);
    const text = `policy failure ${Date.now()}`;
    const response = await request.post(`/api/sessions/${sessionID}/prompt?directory=${POLICY_FAILURE_DIR}`, {
      data: { text, mode: "plan" },
    });
    expect(response.status()).toBe(502);
    expect((await response.json()).error).toContain("Plan policy; prompt was not sent");
    const payloads = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
    expect(payloads.some((item) => JSON.stringify(item).includes(text))).toBe(false);

    const retryText = `build after failure ${Date.now()}`;
    const retry = await request.post(`/api/sessions/${sessionID}/prompt?directory=${POLICY_FAILURE_DIR}`, {
      data: { text: retryText, mode: "build" },
    });
    expect(retry.status()).toBe(202);
    expect(await promptPayload(retryText)).toMatchObject({ agent: "build" });
  });

  test("rejects an invalid mode", async ({ request }) => {
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "unsafe", mode: "review" },
    });
    expect(res.status()).toBe(400);
    const create = await request.post("/api/sessions", {
      data: { directory: DIR, prompt: "unsafe", mode: "review" },
    });
    expect(create.status()).toBe(400);
  });

  test("rejects unsafe image attachments", async ({ request }) => {
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "inspect", attachments: [{ filename: "secret", mime: "text/plain", url: "file:///etc/passwd" }] },
    });
    expect(res.status()).toBe(400);

    const remote = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "inspect", attachments: [{ filename: "remote.png", mime: "image/png", url: "https://example.test/image.png" }] },
    });
    expect(remote.status()).toBe(400);

    const oversized = Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64");
    const large = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "inspect", attachments: [{ filename: "large.png", mime: "image/png", url: `data:image/png;base64,${oversized}` }] },
    });
    expect(large.status()).toBe(400);
  });

  test("creates a session", async ({ request }) => {
    const res = await request.post("/api/sessions", {
      data: { directory: DIR, title: "e2e created" },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).session.title).toBe("e2e created");
    expect(await latestSessionPayload()).not.toHaveProperty("model");
  });

  test("validates and persists a model chosen at session creation", async ({ request }) => {
    const response = await request.post("/api/sessions", {
      data: { directory: DIR, title: "model session", model: { providerID: "openai", modelID: "gpt-5" } },
    });
    expect(response.status()).toBe(201);
    expect((await response.json()).session.model).toEqual({ providerID: "openai", modelID: "gpt-5" });
    expect(await latestSessionPayload()).toMatchObject({ model: { providerID: "openai", id: "gpt-5" } });
    expect(await latestSessionPayload()).not.toHaveProperty("model.modelID");
  });

  test("sends the initial prompt with the selected model and variant", async ({ request }) => {
    const text = `initial variant ${Date.now()}`;
    const response = await request.post("/api/sessions", {
      data: {
        directory: DIR,
        prompt: text,
        mode: "build",
        model: { providerID: "anthropic", modelID: "claude-opus-5", variant: "high" },
      },
    });
    expect(response.status()).toBe(201);
    expect(await latestSessionPayload()).toMatchObject({
      model: { providerID: "anthropic", id: "claude-opus-5", variant: "high" },
    });
    expect(await promptPayload(text)).toMatchObject({
      agent: "build",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
      variant: "high",
    });
  });

  test("exposes reminder metadata without injectable body text", async ({ request }) => {
    const response = await request.get("/api/reminders");
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    expect(payload.reminders.length).toBeGreaterThan(0);
    expect(payload.reminders[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      title: expect.any(String),
      description: expect.any(String),
      triggers: expect.any(Array),
    }));
    expect(payload.reminders[0]).not.toHaveProperty("body");
    expect(payload.reminders[0]).not.toHaveProperty("enabled");
  });

  test("rejects malformed and unknown reminder ids", async ({ request }) => {
    for (const reminder of ["../etc", "", null, 42]) {
      const malformed = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
        data: { text: "go", reminder },
      });
      expect(malformed.status()).toBe(400);
    }
    const unknown = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "go", reminder: "not-in-catalogue" },
    });
    expect(unknown.status()).toBe(400);
  });
});

test.describe("event stream", () => {
  // Playwright's `request` fixture buffers the whole body, which never
  // completes for an intentionally-infinite SSE stream. Read the first frame
  // off the wire and abort instead.
  async function firstFrames(url: string, ms = 3_000): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (buffer.length < 512) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("\n\n")) break;
      }
      void reader.cancel();
      return buffer;
    } finally {
      clearTimeout(timer);
    }
  }

  test("opens with a connected frame", async ({ baseURL }) => {
    const body = await firstFrames(`${baseURL}/api/events`);
    expect(body).toContain('"type":"connected"');
  });

  test("stays open rather than closing after the first frame", async ({ baseURL }) => {
    // A stream that ends immediately would silently degrade the UI to
    // poll-only, so assert the connection is still live.
    const controller = new AbortController();
    const res = await fetch(`${baseURL}/api/events`, { signal: controller.signal });
    const reader = res.body!.getReader();
    await reader.read();
    const second = await Promise.race([
      reader.read().then(() => "data"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still-open"), 1_500)),
    ]);
    controller.abort();
    expect(["data", "still-open"]).toContain(second);
  });
});

test.describe("settings and tools", () => {
  test("global settings round-trip only public fields", async ({ request }) => {
    const saved = await request.patch("/api/settings", {
      data: { model: "anthropic/claude-opus-5", compaction: { auto: true, reserved: 4096 } },
    });
    expect(saved.ok()).toBe(true);
    expect((await saved.json()).settings).toEqual({
      model: "anthropic/claude-opus-5",
      compaction: { auto: true, reserved: 4096 },
    });
    const rejected = await request.patch("/api/settings", { data: { provider: { token: "secret" } } });
    expect(rejected.status()).toBe(400);
  });

  test("MCP action refetches resulting status", async ({ request }) => {
    const before = await (await request.get(`/api/mcp?directory=${DIR}`)).json();
    expect(before.servers.docs).toMatchObject({ status: "failed", error: "mock connection refused" });
    const after = await (await request.post(`/api/mcp/docs/connect?directory=${DIR}`)).json();
    expect(after.servers.docs).toEqual({ status: "connected" });
  });

  test("returns a bounded catalogue without skill or command prompt content", async ({ request }) => {
    const response = await request.get(`/api/catalog?directory=${DIR}`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.servers).toMatchObject({
      github: { status: "connected" },
      registration: { status: "needs_client_registration", error: "register this client first" },
    });
    expect(body.skills).toEqual([{ name: "browser-check", description: "Check a page in the browser.", location: "browser-check/SKILL.md" }]);
    expect(body.commands).toEqual([{ name: "verify", description: "Run project verification.", source: "command", agent: "build", model: "mock/model", subtask: false }]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  test("returns LSP and read-only effective permissions", async ({ request }) => {
    expect((await (await request.get(`/api/lsp?directory=${DIR}`)).json()).servers).toHaveProperty("typescript");
    expect((await (await request.get(`/api/permissions?directory=${DIR}`)).json()).permissions).toEqual({ "*": "ask", read: "allow" });
  });
});

test.describe("workspace", () => {
  test("lists directories first and reads a file", async ({ request }) => {
    const tree = await (await request.get(`/api/workspace/tree?directory=${DIR}&path=`)).json();
    expect(tree.dirs).toContainEqual(expect.objectContaining({ name: "src", type: "directory" }));
    expect(tree.files[0]).toMatchObject({ name: "README.md", type: "file" });
    const file = await (await request.get(`/api/workspace/file?directory=${DIR}&path=README.md`)).json();
    expect(file).toMatchObject({ type: "text", content: "# Mock project" });
  });

  test("rejects traversal before it reaches OpenCode", async ({ request }) => {
    const res = await request.get(`/api/workspace/file?directory=${DIR}&path=../secret`);
    expect(res.status()).toBe(400);
  });

  test("returns diffs and local git history", async ({ request }) => {
    const changes = await (await request.get(`/api/workspace/changes?directory=${DIR}&mode=git`)).json();
    expect(changes.changes[0].file).toBe("src/index.ts");
    const commits = await (await request.get(`/api/workspace/commits?directory=${DIR}`)).json();
    expect(commits.commits[0].subject).toBe("fixture");
  });
});

test.describe("preview security", () => {
  test("allows only configured ports and strips credentials", async ({ request }) => {
    const denied = await request.get("/api/preview/9999/");
    expect(denied.status()).toBe(403);
    const proxied = await request.get(`/api/preview/${PREVIEW_PORT}/hello?q=1`, {
      headers: { Authorization: "Bearer must-not-forward", Cookie: "secret=yes" },
    });
    const body = await proxied.json();
    expect(body.path).toBe("/hello?q=1");
    expect(body.authorization).toBeNull();
    expect(body.cookie).toBeNull();
    expect(proxied.headers()["x-unsafe"]).toBeUndefined();
    expect(proxied.headers()["content-security-policy"]).toContain("sandbox");
  });

  test("rewrites root-relative redirects under the proxy mount", async ({ request }) => {
    const res = await request.get(`/api/preview/${PREVIEW_PORT}/redirect`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe(`/api/preview/${PREVIEW_PORT}/target`);
  });
});

test.describe("worktrees", () => {
  test("lists and creates a ready isolated worktree", async ({ request }) => {
    const listed = await (await request.get(`/api/worktrees?directory=${DIR}`)).json();
    expect(listed.worktrees.length).toBeGreaterThan(0);
    const created = await request.post(`/api/worktrees?directory=${DIR}`, { data: { name: "e2e-isolated" } });
    expect(created.status()).toBe(201);
    expect((await created.json()).worktree.directory).toContain("e2e-isolated");
  });
});

test.describe("permission remote control", () => {
  test("lists and answers a parked permission", async ({ request }) => {
    await fetch(`${MOCK_URL}/test/permissions/reset`, { method: "POST" });
    const before = await (await request.get(`/api/permission-requests?directory=${DIR}`)).json();
    expect(before.requests).toContainEqual(expect.objectContaining({ id: "perm_mock" }));
    const reply = await request.post(`/api/permission-requests/perm_mock/reply?directory=${DIR}`, { data: { reply: "once" } });
    expect(reply.ok()).toBe(true);
    const after = await (await request.get(`/api/permission-requests?directory=${DIR}`)).json();
    expect(after.requests).toEqual([]);
  });

  test("auto-approves once per directory, reconciles pending requests, and leaves questions alone", async ({ request }) => {
    await fetch(`${MOCK_URL}/test/permissions/reset?directory=${encodeURIComponent(AUTO_DIR)}`, { method: "POST" });
    await request.patch(`/api/auto-approve?directory=${AUTO_DIR}`, { data: { enabled: false } });
    expect(await (await request.get(`/api/auto-approve?directory=${AUTO_DIR}`)).json())
      .toEqual({ enabled: false, error: null });

    const invalid = await request.patch(`/api/auto-approve?directory=${AUTO_DIR}`, { data: { enabled: "yes" } });
    expect(invalid.status()).toBe(400);
    const extra = await request.patch(`/api/auto-approve?directory=${AUTO_DIR}`, { data: { enabled: true, reply: "always" } });
    expect(extra.status()).toBe(400);

    const existingID = `perm_existing_${Date.now()}`;
    await fetch(`${MOCK_URL}/test/permission?directory=${encodeURIComponent(AUTO_DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: existingID,
        sessionID: "ses_mock_done",
        permission: "bash",
        patterns: ["npm test"],
        metadata: { command: "npm test" },
        always: ["npm *"],
        tool: { messageID: "msg_auto", callID: "call_auto" },
      }),
    });
    const pending = await (await request.get(`/api/permission-requests?directory=${AUTO_DIR}`)).json();
    expect(pending.requests).toContainEqual(expect.objectContaining({
      id: existingID,
      metadata: { command: "npm test" },
      always: ["npm *"],
      tool: { messageID: "msg_auto", callID: "call_auto" },
    }));

    const enabled = await request.patch(`/api/auto-approve?directory=${AUTO_DIR}`, { data: { enabled: true } });
    expect(await enabled.json()).toEqual({ enabled: true, error: null });
    await expect.poll(async () => await (await fetch(`${MOCK_URL}/test/permission-replies`)).json())
      .toContainEqual({ id: existingID, reply: "once" });
    expect((await (await request.get(`/api/permission-requests?directory=${AUTO_DIR}`)).json()).requests).toEqual([]);
    const questions = await (await request.get(`/api/sessions/ses_mock_done/questions?directory=${AUTO_DIR}`)).json();
    expect(questions.requests).toContainEqual(expect.objectContaining({ id: "que_mock" }));
    expect((await (await request.get(`/api/auto-approve?directory=${DIR}`)).json()).enabled).toBe(false);

    await request.patch(`/api/auto-approve?directory=${AUTO_DIR}`, { data: { enabled: false } });
    const manualID = `perm_manual_${Date.now()}`;
    await fetch(`${MOCK_URL}/test/permission?directory=${encodeURIComponent(AUTO_DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: manualID, sessionID: "ses_mock_done", permission: "read", patterns: ["README.md"] }),
    });
    await expect.poll(async () => (await (await request.get(`/api/permission-requests?directory=${AUTO_DIR}`)).json()).requests)
      .toContainEqual(expect.objectContaining({ id: manualID }));
    await fetch(`${MOCK_URL}/test/permissions/reset?directory=${encodeURIComponent(AUTO_DIR)}`, { method: "POST" });
  });
});
