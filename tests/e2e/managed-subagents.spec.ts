import { expect, test } from "@playwright/test";

// This file owns its directory and both parent ids. Managed launch mutates the
// shared mock session collection, so no other spec may create children here.
const DIR = process.platform === "darwin" ? "/private/tmp/mock-managed-subagent-project" : "/tmp/mock-managed-subagent-project";
const API_PARENT = "ses_mock_managed_api_parent";
const UI_PARENT = "ses_mock_managed_ui_parent";
const FAILURE_PARENT = "ses_mock_managed_failure_parent";
const CLEANUP_FAILURE_PARENT = "ses_mock_managed_cleanup_failure_parent";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;
const scoped = (path: string) => `/api${path}?directory=${encodeURIComponent(DIR)}`;

test("creates an idempotent independently configured child", async ({ request }) => {
  const input = {
    prompt: "Implement the managed API probe",
    agent: "build",
    authorization: "modify",
    model: { providerID: "anthropic", modelID: "claude-opus-5", variant: "high" },
    idempotencyKey: "managed-api-probe",
  };
  const response = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), { data: input });
  expect(response.status()).toBe(201);
  const body = await response.json() as { session: { id: string; parentID?: string; agent?: string; managed?: unknown } };
  expect(body.session).toMatchObject({
    parentID: API_PARENT,
    agent: "build",
    managed: {
      origin: "managed-human",
      requestedAgent: "build",
      requestedModel: input.model,
      background: true,
      policySource: "creation-permission",
      effectivePolicyObserved: true,
    },
  });

  const repeated = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), { data: input });
  expect(repeated.status()).toBe(201);
  expect((await repeated.json() as { session: { id: string } }).session.id).toBe(body.session.id);
  const conflict = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: { ...input, prompt: "Different work" },
  });
  expect(conflict.status()).toBe(409);

  const report = await (await request.get(scoped(`/sessions/${API_PARENT}/subagents`))).json() as {
    tasks: Array<Record<string, unknown>>;
  };
  expect(report.tasks.filter((task) => task.sessionID === body.session.id)).toEqual([
    expect.objectContaining({
      origin: "managed-human",
      requestedAgent: "build",
      requestedModel: input.model,
      state: "completed",
      evidence: "child-transcript",
      background: true,
      policySource: "creation-permission",
      effectivePolicyObserved: true,
    }),
  ]);

  const creates = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
  const create = creates.find((payload) => payload.parentID === API_PARENT);
  expect(create).toMatchObject({
    parentID: API_PARENT,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5", variant: "high" },
    metadata: { customDcaManagedChild: { origin: "managed-human", requestedAgent: "build" } },
  });
  expect(create?.permission).toEqual(expect.arrayContaining([
    expect.objectContaining({ permission: "bash", pattern: "git *", action: "allow" }),
    expect.objectContaining({ permission: "bash", pattern: "rm -rf *", action: "deny" }),
    expect.objectContaining({ permission: "edit", pattern: "*", action: "allow" }),
  ]));
  const prompts = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  expect(prompts.find((payload) => payload.sessionID === body.session.id)).toMatchObject({
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-opus-5" },
    variant: "high",
  });
});

test("advertises only the retained Managed Child agents", async ({ request }) => {
  const response = await request.get(scoped("/managed-child-agents"));
  expect(response.status()).toBe(200);
  expect((await response.json() as { agents: unknown[] }).agents).toEqual([
    expect.objectContaining({ id: "plan", access: "read-only" }),
    expect.objectContaining({ id: "build", access: "can-modify" }),
    expect.objectContaining({ id: "explore", access: "read-only" }),
    expect.objectContaining({ id: "general", access: "can-modify" }),
  ]);
});

test("accepts the shipped mode field as a legacy Plan/Build alias", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: { prompt: "Legacy cached browser launch", mode: "build", authorization: "modify", idempotencyKey: "managed-legacy-mode" },
  });
  expect(response.status()).toBe(201);
  expect((await response.json() as { session: { managed?: unknown } }).session.managed).toMatchObject({
    requestedAgent: "build",
  });
});

test("creates Plan children with an explicit read-only session ceiling", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: {
      prompt: "Research without mutation",
      agent: "plan",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
      idempotencyKey: "managed-plan-probe",
    },
  });
  expect(response.status()).toBe(201);
  const childID = (await response.json() as { session: { id: string } }).session.id;
  const creates = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
  const create = creates.find((payload) =>
    payload.parentID === API_PARENT &&
    (payload.metadata as { customDcaManagedChild?: { requestedAgent?: string } } | undefined)
      ?.customDcaManagedChild?.requestedAgent === "plan");
  expect(create?.permission).toEqual(expect.arrayContaining([
    { permission: "bash", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "*", action: "deny" },
    { permission: "write", pattern: "*", action: "deny" },
    { permission: "apply_patch", pattern: "*", action: "deny" },
  ]));
  const policy = await (await fetch(`${MOCK_URL}/test/session-policy?id=${encodeURIComponent(childID)}`)).json() as {
    disabledTools: string[];
  };
  expect(policy.disabledTools).toEqual(expect.arrayContaining(["bash", "edit", "write", "apply_patch"]));
});

test("projects Explore and General policies independently", async ({ request }) => {
  const explore = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: { prompt: "Explore safely", agent: "explore", idempotencyKey: "managed-explore-probe" },
  });
  expect(explore.status()).toBe(201);
  const exploreID = (await explore.json() as { session: { id: string } }).session.id;
  const general = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: { prompt: "Handle general work", agent: "general", authorization: "modify", idempotencyKey: "managed-general-probe" },
  });
  expect(general.status()).toBe(201);
  const creates = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
  const byAgent = (agent: string) => creates.find((payload) => payload.parentID === API_PARENT && payload.agent === agent);
  expect(byAgent("explore")?.permission).toEqual(expect.arrayContaining([
    { permission: "bash", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "*", action: "deny" },
  ]));
  expect(byAgent("general")?.permission).toEqual(expect.arrayContaining([
    expect.objectContaining({ permission: "edit", pattern: "*", action: "allow" }),
    { permission: "todowrite", pattern: "*", action: "deny" },
  ]));
  expect((await fetch(`${MOCK_URL}/test/session-policy/tamper?id=${encodeURIComponent(exploreID)}`, { method: "POST" })).ok).toBe(true);
  const driftedFollowup = await request.post(scoped(`/sessions/${exploreID}/prompt`), {
    data: { text: "This must not run after policy drift", mode: "plan" },
  });
  expect(driftedFollowup.status()).toBe(409);
  expect((await driftedFollowup.json()).error).toContain("configuration could not be verified");
});

test("rejects malformed Managed Child metadata instead of falling back to root prompting", async ({ request }) => {
  const launch = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: {
      prompt: "Create a child to tamper",
      agent: "build",
      authorization: "modify",
      idempotencyKey: "managed-metadata-tamper",
    },
  });
  expect(launch.status()).toBe(201);
  const childID = (await launch.json() as { session: { id: string } }).session.id;
  expect((await fetch(`${MOCK_URL}/test/managed-metadata/tamper?id=${encodeURIComponent(childID)}`, { method: "POST" })).ok).toBe(true);
  const text = "This malformed Managed Child must not run";
  const followup = await request.post(scoped(`/sessions/${childID}/prompt`), {
    data: { text, mode: "build" },
  });
  expect(followup.status()).toBe(409);
  expect((await followup.json()).error).toContain("configuration could not be verified");
  const prompts = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  expect(prompts.some((item) => JSON.stringify(item).includes(text))).toBe(false);
});

test("fails closed before creating a child for invalid input or parent", async ({ request }) => {
  const missingAuthorization = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: { prompt: "No implicit mutation", agent: "general", idempotencyKey: "missing-modify-authorization" },
  });
  expect(missingAuthorization.status()).toBe(400);
  expect((await missingAuthorization.json()).error).toContain("explicit modify authorization");
  const invalid = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: { prompt: "Try it", agent: "build", idempotencyKey: "x", permission: [] },
  });
  expect(invalid.status()).toBe(400);
  const missing = await request.post(scoped("/sessions/ses_missing/managed-children"), {
    data: { prompt: "Try it", agent: "plan", idempotencyKey: "missing-parent" },
  });
  expect(missing.status()).toBe(404);
});

test("deletes a child when asynchronous prompt submission fails", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${FAILURE_PARENT}/managed-children`), {
    data: { prompt: "FAIL_MANAGED_PROMPT", agent: "plan", idempotencyKey: "managed-prompt-failure" },
  });
  expect(response.status()).toBe(502);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining("503") });
  const report = await (await request.get(scoped(`/sessions/${FAILURE_PARENT}/subagents`))).json() as { tasks: unknown[] };
  expect(report.tasks).toEqual([]);
});

test("reports a child that may remain when partial-launch cleanup also fails", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${CLEANUP_FAILURE_PARENT}/managed-children`), {
    data: { prompt: "FAIL_MANAGED_PROMPT", agent: "plan", idempotencyKey: "managed-cleanup-failure" },
  });
  expect(response.status()).toBe(502);
  const body = await response.json() as { childID: string; cleanupFailed: boolean; error: string };
  expect(body).toMatchObject({ cleanupFailed: true, childID: expect.stringMatching(/^ses_mock_new_/) });
  expect(body.error).toContain("cleanup also failed");
  const report = await (await request.get(scoped(`/sessions/${CLEANUP_FAILURE_PARENT}/subagents`))).json() as {
    tasks: Array<{ sessionID: string }>;
  };
  expect(report.tasks.map((task) => task.sessionID)).toContain(body.childID);
});

test("launches a General Managed Child through explicit human confirmation", async ({ page }) => {
  await page.goto(`/sessions/${UI_PARENT}?directory=${encodeURIComponent(DIR)}&panel=subagents`);
  await page.getByTestId("opencode-managed-child-open").click();
  const dialog = page.getByTestId("opencode-managed-child-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("opencode-managed-child-agent-plan")).toBeVisible();
  await expect(dialog.getByTestId("opencode-managed-child-agent-explore")).toBeVisible();
  await expect(dialog.getByTestId("opencode-managed-child-agent-general")).toBeVisible();
  await dialog.getByTestId("opencode-managed-child-prompt").fill("Run the independent General child");
  await dialog.getByTestId("opencode-managed-child-agent-explore").click();
  await expect(dialog.getByTestId("opencode-managed-child-build-confirmation")).toHaveCount(0);
  await dialog.getByTestId("opencode-managed-child-agent-build").click();
  await dialog.getByTestId("opencode-managed-child-build-confirm").check();
  await dialog.getByTestId("opencode-managed-child-agent-general").click();
  await expect(dialog.getByTestId("opencode-managed-child-build-confirmation")).toBeVisible();
  await expect(dialog.getByTestId("opencode-managed-child-build-confirm")).not.toBeChecked();
  await expect(dialog.getByTestId("opencode-managed-child-submit")).toBeDisabled();
  await dialog.getByTestId("opencode-managed-child-build-confirm").check();
  await expect(dialog.getByTestId("opencode-managed-child-model")).toHaveAttribute("value", "anthropic/claude-opus-5");
  await dialog.getByTestId("opencode-managed-child-model").click();
  const picker = page.getByTestId("opencode-managed-child-model-panel");
  await expect(picker).toBeVisible();
  const parentDialog = dialog.locator('[role="dialog"]');
  await expect(parentDialog).toHaveAttribute("aria-hidden", "true");
  expect(await parentDialog.evaluate((element) => element.inert)).toBe(true);
  await expect(picker.getByTestId("opencode-managed-child-model-search")).toBeFocused();
  expect(await picker.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 120));
    return top === element || element.contains(top);
  })).toBe(true);
  await picker.getByTestId("opencode-managed-child-model-search").fill("GPT-5.6 Sol");
  await picker.locator('[data-testid="opencode-managed-child-model-option"][data-model-key="openai/gpt-5.6-sol"]').click();
  await expect(parentDialog).not.toHaveAttribute("aria-hidden", "true");
  expect(await parentDialog.evaluate((element) => element.inert)).toBe(false);
  await expect(dialog.getByTestId("opencode-managed-child-model")).toHaveAttribute("value", "openai/gpt-5.6-sol");
  await dialog.getByTestId("opencode-managed-child-submit").click();
  await expect(dialog).toHaveCount(0);

  const row = page.getByTestId("opencode-subagent-row").filter({ hasText: "Run the independent General child" }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("opencode-subagent-origin")).toHaveText("Managed Child");
  await expect(row.getByTestId("opencode-managed-child-requested-agent")).toHaveText("agent: general");
  await expect(row.getByTestId("opencode-subagent-requested-model")).toContainText("openai/gpt-5.6-sol");
  await expect(row.getByTestId("opencode-subagent-policy-status")).toHaveText("policy: verified at launch");
  const prompts = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  const payload = prompts.find((item) => (item.parts as Array<{ text?: string }> | undefined)
    ?.some((part) => part.text === "Run the independent General child"));
  expect(payload).toMatchObject({ agent: "general", model: { providerID: "openai", modelID: "gpt-5.6-sol" } });
  await row.getByTestId("opencode-subagent-open").click();
  await expect(page.getByTestId("opencode-parent-link")).toContainText("Managed UI parent");
  await expect(page.getByTestId("opencode-managed-child-agent-fixed")).toContainText("General");
  await page.getByTestId("opencode-composer").fill("Continue the Managed Child conversation");
  await page.getByTestId("opencode-send").click();
  await expect(page.getByTestId("opencode-composer")).toHaveValue("");
  await expect.poll(async () => {
    const followups = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
    return followups.find((item) => (item.parts as Array<{ text?: string }> | undefined)
      ?.some((part) => part.text === "Continue the Managed Child conversation"));
  }).toMatchObject({ agent: "general" });
});

test("keeps the launch dialog usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto(`/sessions/${UI_PARENT}?directory=${encodeURIComponent(DIR)}&panel=subagents`);
  const sheet = page.getByTestId("opencode-mobile-inspector");
  await sheet.getByTestId("opencode-managed-child-open").click();
  const dialog = page.getByTestId("opencode-managed-child-dialog");
  await expect(dialog).toBeVisible();
  expect((await dialog.getByTestId("opencode-managed-child-close").boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("keeps the assignment available when launch fails", async ({ page }) => {
  await page.route("**/api/sessions/*/managed-children?*", (route) => route.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ error: "Managed launch is temporarily unavailable" }),
  }));
  await page.goto(`/sessions/${UI_PARENT}?directory=${encodeURIComponent(DIR)}&panel=subagents`);
  await page.getByTestId("opencode-managed-child-open").click();
  const dialog = page.getByTestId("opencode-managed-child-dialog");
  const prompt = dialog.getByTestId("opencode-managed-child-prompt");
  await prompt.fill("Keep this assignment after failure");
  await expect(dialog.getByTestId("opencode-managed-child-model")).toHaveAttribute("value", "anthropic/claude-opus-5");
  await dialog.getByTestId("opencode-managed-child-submit").click();
  await expect(dialog).toContainText("Managed launch is temporarily unavailable");
  await expect(prompt).toHaveValue("Keep this assignment after failure");
});
