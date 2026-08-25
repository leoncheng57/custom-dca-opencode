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
    mode: "build",
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
      requestedMode: "build",
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
      requestedMode: "build",
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
    metadata: { customDcaManagedChild: { origin: "managed-human", requestedMode: "build" } },
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

test("creates Plan children with an explicit read-only session ceiling", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: {
      prompt: "Research without mutation",
      mode: "plan",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
      idempotencyKey: "managed-plan-probe",
    },
  });
  expect(response.status()).toBe(201);
  const childID = (await response.json() as { session: { id: string } }).session.id;
  const creates = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
  const create = creates.find((payload) =>
    payload.parentID === API_PARENT &&
    (payload.metadata as { customDcaManagedChild?: { requestedMode?: string } } | undefined)
      ?.customDcaManagedChild?.requestedMode === "plan");
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

test("fails closed before creating a child for invalid input or parent", async ({ request }) => {
  const invalid = await request.post(scoped(`/sessions/${API_PARENT}/managed-children`), {
    data: { prompt: "Try it", mode: "build", idempotencyKey: "x", permission: [] },
  });
  expect(invalid.status()).toBe(400);
  const missing = await request.post(scoped("/sessions/ses_missing/managed-children"), {
    data: { prompt: "Try it", mode: "plan", idempotencyKey: "missing-parent" },
  });
  expect(missing.status()).toBe(404);
});

test("deletes a child when asynchronous prompt submission fails", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${FAILURE_PARENT}/managed-children`), {
    data: { prompt: "FAIL_MANAGED_PROMPT", mode: "plan", idempotencyKey: "managed-prompt-failure" },
  });
  expect(response.status()).toBe(502);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining("503") });
  const report = await (await request.get(scoped(`/sessions/${FAILURE_PARENT}/subagents`))).json() as { tasks: unknown[] };
  expect(report.tasks).toEqual([]);
});

test("reports a child that may remain when partial-launch cleanup also fails", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${CLEANUP_FAILURE_PARENT}/managed-children`), {
    data: { prompt: "FAIL_MANAGED_PROMPT", mode: "plan", idempotencyKey: "managed-cleanup-failure" },
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

test("launches a Build child from a Plan parent through explicit human confirmation", async ({ page }) => {
  await page.goto(`/sessions/${UI_PARENT}?directory=${encodeURIComponent(DIR)}&panel=subagents`);
  await page.getByTestId("opencode-managed-child-open").click();
  const dialog = page.getByTestId("opencode-managed-child-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("opencode-managed-child-prompt").fill("Build the independent UI child");
  await dialog.getByTestId("opencode-managed-child-mode-build").click();
  await expect(dialog.getByTestId("opencode-managed-child-submit")).toBeDisabled();
  await dialog.getByTestId("opencode-managed-child-build-confirm").check();
  await expect(dialog.getByTestId("opencode-managed-child-model")).toHaveAttribute("value", "anthropic/claude-opus-5");
  await dialog.getByTestId("opencode-managed-child-submit").click();
  await expect(dialog).toHaveCount(0);

  const row = page.getByTestId("opencode-subagent-row").filter({ hasText: "Build the independent UI child" });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("opencode-subagent-origin")).toHaveText("Human launch");
  await expect(row.getByTestId("opencode-subagent-requested-mode")).toHaveText("requested: build");
  await expect(row.getByTestId("opencode-subagent-policy-status")).toHaveText("policy: verified at launch");
  await row.getByTestId("opencode-subagent-open").click();
  await expect(page.getByTestId("opencode-parent-link")).toContainText("Managed UI parent");
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
