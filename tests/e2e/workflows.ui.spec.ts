import { expect, test } from "@playwright/test";

// Composer workflow picker (issue #167) — the built SPA against the real BFF
// against the mock agent. This file owns /tmp/mock-workflow-project and its
// two fixture sessions; no other spec may prompt into or launch children under
// them (tests/e2e-shared-state-ownership.test.ts enforces the directory rule).

const DIR = process.platform === "darwin" ? "/private/tmp/mock-workflow-project" : "/tmp/mock-workflow-project";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;
const MAIN = "ses_mock_workflow_main";
const TARGET = "ses_mock_workflow_target";
const mainSession = `/sessions/${MAIN}?directory=${encodeURIComponent(DIR)}`;

async function promptPayloadsContaining(fragment: string): Promise<Array<Record<string, unknown>>> {
  const payloads = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  return payloads.filter((item) => {
    const parts = item.parts as Array<{ type?: string; text?: string }> | undefined;
    return parts?.some((part) => part.type === "text" && part.text?.includes(fragment)) ?? false;
  });
}

async function promptPayloadContaining(fragment: string): Promise<Record<string, unknown> | undefined> {
  return (await promptPayloadsContaining(fragment))[0];
}

async function expectPromptPayloadContaining(fragment: string): Promise<Record<string, unknown>> {
  await expect.poll(() => promptPayloadContaining(fragment)).toBeDefined();
  return (await promptPayloadContaining(fragment))!;
}

function promptText(payload: Record<string, unknown>): string {
  const parts = payload.parts as Array<{ type?: string; text?: string }>;
  return parts.find((part) => part.type === "text")?.text ?? "";
}

test.describe("workflow catalogue API", () => {
  test("exposes the catalogue with visible injector text", async ({ request }) => {
    const response = await request.get("/api/workflows");
    expect(response.status()).toBe(200);
    const payload = await response.json() as { workflows: Array<Record<string, unknown>> };
    expect(payload.workflows.map((workflow) => workflow.id)).toEqual([
      "playwright-ui-review",
      "pr-snippet-review",
      "session-update",
      "managed-child",
      "start-dca-session",
      "design-doc-prototype",
    ]);
    for (const workflow of payload.workflows) {
      expect(Object.keys(workflow).sort()).toEqual(["description", "id", "injector", "title"]);
      expect(String(workflow.injector).length).toBeGreaterThan(0);
    }
    const sessionUpdate = payload.workflows.find((workflow) => workflow.id === "session-update")!;
    expect(String(sessionUpdate.injector)).toContain("204");
  });

  test("rejects unknown and malformed workflow ids at prompt time", async ({ request }) => {
    const send = (workflow: string) => request.post(`/api/sessions/${MAIN}/prompt?directory=${encodeURIComponent(DIR)}`, {
      data: { text: "workflow validation probe", mode: "build", workflow },
    });
    const unknown = await send("no-such-workflow");
    expect(unknown.status()).toBe(400);
    expect((await unknown.json()).error).toContain("unknown workflow");
    const malformed = await send("Bad_Id!");
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).error).toContain("workflow must be a valid workflow id");
    // Neither invalid request may reach the agent.
    expect(await promptPayloadContaining("workflow validation probe")).toBeUndefined();
  });

  test("rejects an unknown workflow on managed child launch", async ({ request }) => {
    // Named `idem` and kept short so secret scanners do not misread a test
    // idempotency token as a credential.
    const idem = `wf-${Date.now()}`;
    const response = await request.post(`/api/sessions/${MAIN}/managed-children?directory=${encodeURIComponent(DIR)}`, {
      data: { prompt: "managed workflow validation probe", mode: "plan", idempotencyKey: idem, workflow: "no-such-workflow" },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain("unknown workflow");
  });

  test("validates root workflow input before mutation and identifies worktree/session failures", async ({ request }) => {
    const launch = (data: Record<string, unknown>) => request.post(`/api/session-workflows/start?directory=${encodeURIComponent(DIR)}`, { data: {
      sourceSessionID: MAIN,
      prompt: `api-root-${Date.now()}`,
      mode: "plan",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
      isolated: false,
      idempotencyKey: `api-root-${crypto.randomUUID()}`,
      workflow: "start-dca-session",
      ...data,
    } });

    const invalidModel = await launch({ model: { providerID: "missing", modelID: "missing" } });
    expect(invalidModel.status()).toBe(400);
    expect((await invalidModel.json()).error).toContain("unknown or disabled model");

    const unauthorized = await launch({ mode: "build" });
    expect(unauthorized.status()).toBe(400);
    expect((await unauthorized.json()).error).toContain("explicit modify authorization");

    await fetch(`${MOCK_URL}/test/root-workflow-failure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "worktree", directory: DIR }) });
    const worktree = await launch({ isolated: true });
    expect(worktree.status()).toBe(502);
    await expect(worktree.json()).resolves.toMatchObject({ stage: "worktree", code: "ROOT_SESSION_WORKTREE_FAILED" });

    await fetch(`${MOCK_URL}/test/root-workflow-failure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "session", directory: DIR }) });
    const session = await launch({ isolated: false });
    expect(session.status()).toBe(502);
    await expect(session.json()).resolves.toMatchObject({ stage: "session", code: "ROOT_SESSION_CREATION_FAILED", directory: DIR });
  });
});

test.describe("workflow picker UI", () => {
  test("playwright review: form, preview, apply to composer, explicit send", async ({ page }) => {
    const marker = `WF-PLAYWRIGHT-${Date.now()}`;
    await page.goto(mainSession);
    const picker = page.getByTestId("composer-workflow-select");
    await expect(picker).toBeVisible();
    await expect(picker).toContainText("Workflows");
    await picker.click();

    // The chooser offers exactly the initial catalogue, in order.
    const options = page.getByTestId("composer-workflow-option");
    await expect(options).toHaveCount(6);
    await expect(page.getByTestId("composer-workflow-group")).toHaveCount(3);
    await expect(page.getByTestId("composer-workflow-group").nth(0)).toHaveAccessibleName("Review");
    await expect(page.getByTestId("composer-workflow-icon")).toHaveCount(6);
    await expect(options.nth(0)).toContainText("Review a UI change with Playwright");
    await expect(options.nth(1)).toContainText("Post a snippet-by-snippet PR review");
    await expect(options.nth(2)).toContainText("Send an update to another session");
    await expect(options.nth(3)).toContainText("Launch a Managed Child");
    await expect(options.nth(4)).toContainText("Start a DCA session");
    await expect(options.nth(5)).toContainText("Capture a Durable Design Prototype");

    // Choosing a workflow opens its form — it never sends.
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="playwright-ui-review"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-workflow", "playwright-ui-review");
    await expect(dialog).toContainText("without a full deployment or a complete screenshot regeneration");
    await expect(dialog.getByTestId("composer-workflow-field-route")).toHaveValue(mainSession);
    await dialog.getByTestId("composer-workflow-known-route").selectOption("/settings");
    await expect(dialog.getByTestId("composer-workflow-field-route")).toHaveValue("/settings");
    await dialog.getByTestId("composer-workflow-use-current-page").click();
    await expect(dialog.getByTestId("composer-workflow-field-route")).toHaveValue(mainSession);
    await dialog.getByTestId("composer-workflow-field-route").fill("/not-a-real-route");
    await expect(dialog.getByTestId("composer-workflow-route-invalid")).toBeVisible();
    await expect(dialog.getByTestId("composer-workflow-preview")).toBeDisabled();
    await dialog.getByTestId("composer-workflow-field-route").fill("/sessions/demo?directory=/tmp/example");
    await dialog.getByTestId("composer-workflow-field-target").fill(marker);
    await dialog.getByTestId("composer-workflow-field-scope").selectOption("interaction");
    await dialog.getByTestId("composer-workflow-preview").click();

    // Preview shows the exact generated prompt and the trusted injector.
    await expect(dialog.getByTestId("composer-workflow-prompt-preview")).toContainText(`Desired state or interaction: ${marker}`);
    await expect(dialog.getByTestId("composer-workflow-prompt-preview")).toContainText("Capture scope: Focused interaction check (assertions only)");
    const injector = dialog.getByTestId("composer-workflow-injector");
    await expect(injector).toContainText('server-resolved from id "playwright-ui-review"');
    await expect(injector).toContainText("Never regenerate the complete screenshot set.");
    expect(await promptPayloadContaining(marker)).toBeUndefined();

    // Apply to composer fills the draft and attaches the workflow — no send.
    await dialog.getByTestId("composer-workflow-apply").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("opencode-composer")).toHaveValue(new RegExp(marker));
    await expect(picker).toHaveAttribute("value", "playwright-ui-review");
    expect(await promptPayloadContaining(marker)).toBeUndefined();

    // The explicit composer Send is the only thing that submits.
    await page.getByTestId("opencode-send").click();
    await expect(picker).toHaveAttribute("value", "");
    const user = page.getByTestId("opencode-user-message").filter({ hasText: marker });
    await expect(user).toBeVisible();
    const attached = user.getByTestId("opencode-manual-workflow");
    await expect(attached).toContainText("workflow attached - playwright-ui-review");
    await expect(attached).toContainText("Never regenerate the complete screenshot set.");
    await expect(user.getByTestId("opencode-user-message-body")).not.toContainText("<workflow");

    const payload = await expectPromptPayloadContaining(marker);
    expect(payload!.sessionID).toBe(MAIN);
    const text = promptText(payload!);
    expect(text).toContain("Review a UI change with Playwright.");
    expect(text).toContain('<workflow name="playwright-ui-review">');
    expect(text).toContain("Never regenerate the complete screenshot set.");
  });

  test("design prototype: no fields, fixed prompt, sends into this session", async ({ page }) => {
    // The prompt is a fixed constant rather than a marker-bearing draft, so
    // this counts matching payloads instead of asserting absence — a retry of
    // this very test would otherwise trip over its own earlier send.
    const FIXED = "Capture a durable design prototype for this proposal and publish it for review.";
    const before = (await promptPayloadsContaining(FIXED)).length;

    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="design-doc-prototype"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await expect(dialog).toHaveAttribute("data-workflow", "design-doc-prototype");

    // Zero-field path: nothing to fill in, so confirm is live immediately.
    await expect(dialog.locator('[data-testid^="composer-workflow-field-"]')).toHaveCount(0);
    await expect(dialog.getByTestId("composer-workflow-no-fields")).toContainText("No input needed");
    await expect(dialog.getByTestId("composer-workflow-preview")).toBeEnabled();
    await dialog.getByTestId("composer-workflow-preview").click();

    // The preview still shows the exact prompt and the trusted procedure.
    await expect(dialog.getByTestId("composer-workflow-prompt-preview")).toHaveText(FIXED);
    const injector = dialog.getByTestId("composer-workflow-injector");
    await expect(injector).toContainText('server-resolved from id "design-doc-prototype"');
    await expect(injector).toContainText("ntn CLI");
    await expect(injector).toContainText("NOT yet built");
    expect((await promptPayloadsContaining(FIXED)).length).toBe(before);

    // Both non-destructive exits are offered; Send is the one taken here.
    await expect(dialog.getByTestId("composer-workflow-apply")).toBeVisible();
    await dialog.getByTestId("composer-workflow-send").click();
    await expect(dialog).toHaveCount(0);

    await expect.poll(async () => (await promptPayloadsContaining(FIXED)).length).toBeGreaterThan(before);
    const payload = (await promptPayloadsContaining(FIXED)).at(-1)!;
    // Sent into THIS session, like the review workflows: there is no target
    // session and no child to create.
    expect(payload.sessionID).toBe(MAIN);
    const text = promptText(payload);
    expect(text).toContain(FIXED);
    expect(text).toContain('<workflow name="design-doc-prototype">');
    expect(text).toContain("ntn CLI");
  });

  test("session update: target preview, explicit send, accepted is not completed", async ({ page }) => {
    const marker = `WF-UPDATE-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="session-update"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");

    // The current session is not offered as its own target.
    const results = dialog.getByTestId("composer-workflow-session-results");
    await expect(results.locator(`[data-session-id="${TARGET}"]`)).toContainText("Workflow update target");
    await expect(results.locator(`[data-session-id="${TARGET}"]`)).toContainText("Root");
    await expect(results.locator(`[data-session-id="${MAIN}"]`)).toHaveCount(0);
    await dialog.getByTestId("composer-workflow-session-search").fill("update target");
    await expect(results.locator(`[data-session-id="${TARGET}"]`)).toBeVisible();
    await results.locator(`[data-session-id="${TARGET}"]`).click();
    await dialog.getByTestId("composer-workflow-field-message").fill(marker);
    await dialog.getByTestId("composer-workflow-preview").click();

    await expect(dialog.getByTestId("composer-workflow-target-title")).toHaveText("Workflow update target");
    await expect(dialog.getByTestId("composer-workflow-target-id")).toHaveText(TARGET);
    await expect(dialog.getByTestId("composer-workflow-prompt-preview")).toHaveText(marker);
    await expect(dialog.getByTestId("composer-workflow-accepted-note")).toContainText("204 for accepted, not completed");
    expect(await promptPayloadContaining(marker)).toBeUndefined();

    await dialog.getByTestId("composer-workflow-send").click();
    const done = dialog.getByTestId("composer-workflow-done");
    await expect(done).toBeVisible();
    await expect(done).toContainText("Accepted means queued, not completed");
    await expect(dialog.getByTestId("composer-workflow-open-session")).toHaveAttribute("href", new RegExp(`/sessions/${TARGET}\\?`));

    const payload = await expectPromptPayloadContaining(marker);
    expect(payload!.sessionID).toBe(TARGET);
    const text = promptText(payload!);
    expect(text).toContain('<workflow name="session-update">');
    expect(text).toContain("204");
    await dialog.getByTestId("composer-workflow-done-close").click();
    await expect(dialog).toHaveCount(0);
  });

  test("session update states bounded search truncation honestly", async ({ page }) => {
    await page.route("**/api/sessions?*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== "/api/sessions") return route.continue();
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          truncated: true,
          sessions: Array.from({ length: 25 }, (_, index) => ({
            id: `ses_search_${index}`,
            title: `Duplicate title ${index}`,
            directory: DIR,
            childCount: 0,
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(index * 1000).toISOString(),
            archived: false,
            running: index === 0,
          })),
        }),
      });
    });
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="session-update"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await expect(dialog.getByTestId("composer-workflow-session-option")).toHaveCount(25);
    await expect(dialog.getByTestId("composer-workflow-sessions-truncated")).toContainText("first 25 matches");
    await expect(dialog.getByTestId("composer-workflow-session-option").first()).toContainText("Running");
  });

  test("managed child: explains the contract, launches only on explicit confirm", async ({ page }) => {
    const marker = `WF-CHILD-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="managed-child"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");

    await dialog.getByTestId("composer-workflow-field-objective").fill(marker);
    // Defect 1: the catalogue, not a hardcoded Plan/Build pair, decides which
    // agents exist. All four must be offered after a fresh navigation.
    for (const agent of ["plan", "build", "explore", "general"]) {
      await expect(dialog.getByTestId(`composer-workflow-mode-${agent}`)).toBeVisible();
    }
    await expect(dialog.getByTestId("composer-workflow-mode-plan")).toContainText("read-only");
    await expect(dialog.getByTestId("composer-workflow-mode-explore")).toContainText("read-only");
    await expect(dialog.getByTestId("composer-workflow-mode-build")).toContainText("can-modify");
    await expect(dialog.getByTestId("composer-workflow-mode-general")).toContainText("can-modify");
    await expect(dialog.getByTestId("composer-workflow-mode-plan")).toHaveAttribute("aria-pressed", "true");
    const notes = dialog.getByTestId("composer-workflow-managed-notes");
    await expect(notes).toContainText("independent transcript");
    await expect(notes).toContainText("fixed at creation time");
    await expect(notes).toContainText("No native task card");
    await expect(notes).toContainText("No automatic hand-back");
    await dialog.getByTestId("composer-workflow-preview").click();

    await expect(dialog.getByTestId("composer-workflow-prompt-preview")).toHaveText(marker);
    await expect(dialog.getByTestId("composer-workflow-injector")).toContainText("managed child session");
    // The preview reads the catalogue too, instead of restating "Plan"/"Build".
    await expect(dialog.getByTestId("composer-workflow-agent-summary")).toContainText("Plan · read-only");
    expect(await promptPayloadContaining(marker)).toBeUndefined();

    await dialog.getByTestId("composer-workflow-launch").click();
    const done = dialog.getByTestId("composer-workflow-done");
    await expect(done).toBeVisible();
    await expect(done).toContainText("no automatic hand-back will occur");

    const payload = await expectPromptPayloadContaining(marker);
    expect(promptText(payload!)).toContain('<workflow name="managed-child">');

    const sessionPayloads = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
    const created = sessionPayloads.find((item) => item.title === marker);
    expect(created).toBeDefined();
    expect(created!.parentID).toBe(MAIN);
    expect(created!.agent).toBe("plan");
    await dialog.getByTestId("composer-workflow-done-close").click();
  });

  test("start DCA session: defaults isolated and Plan, uses the composer model, and creates one root", async ({ page }) => {
    const marker = `WF-ROOT-${Date.now()}`;
    const beforeUrl = mainSession;
    await page.goto(beforeUrl);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="start-dca-session"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await expect(dialog.getByTestId("composer-workflow-root-assignment")).toBeFocused();
    await expect(dialog.getByTestId("composer-workflow-root-isolated")).toBeChecked();
    await expect(dialog.getByTestId("composer-workflow-root-mode-plan")).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByTestId("composer-workflow-root-model")).toHaveAttribute("value", "anthropic/claude-opus-5");
    await expect(dialog.getByTestId("composer-workflow-root-directory")).toContainText(DIR);
    await dialog.getByTestId("composer-workflow-root-assignment").fill(marker);
    await dialog.getByTestId("composer-workflow-preview").click();
    await expect(dialog.getByTestId("composer-workflow-root-summary")).toContainText("no parentID");
    await expect(dialog.getByTestId("composer-workflow-injector")).toContainText("independent root session");
    await expect(dialog.getByTestId("composer-workflow-apply")).toHaveCount(0);
    await dialog.getByTestId("composer-workflow-root-start").click();
    await expect(dialog.getByTestId("composer-workflow-done")).toContainText("no parent");
    await expect(dialog.getByTestId("composer-workflow-open-session")).toHaveAttribute("href", /mock-workflow-project\.worktrees/);
    expect(page.url()).toContain(beforeUrl);

    const creates = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
    const created = creates.filter((item) => item.agent === "plan" && item.parentID === undefined).at(-1)!;
    expect(created).toBeDefined();
    expect(created.parentID).toBeUndefined();
    expect(created.model).toMatchObject({ providerID: "anthropic", id: "claude-opus-5" });
    const payload = await expectPromptPayloadContaining(marker);
    expect(payload.sessionID).not.toBe(MAIN);
    expect(payload.agent).toBe("plan");
    expect(promptText(payload)).toContain('<workflow name="start-dca-session">');
  });

  test("start DCA session: existing-directory Build requires authorization", async ({ page }) => {
    const marker = `WF-ROOT-BUILD-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="start-dca-session"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-root-assignment").fill(marker);
    await dialog.getByTestId("composer-workflow-root-isolated").uncheck();
    await dialog.getByTestId("composer-workflow-root-mode-build").click();
    await dialog.getByTestId("composer-workflow-preview").click();
    await expect(dialog.getByTestId("composer-workflow-root-start")).toBeDisabled();
    await dialog.getByTestId("composer-workflow-root-build-confirm").check();
    await page.route("**/api/session-workflows/start?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue();
    }, { times: 1 });
    const start = dialog.getByTestId("composer-workflow-root-start");
    await start.click();
    await expect(start).toHaveText("Starting…");
    await expect(start).toBeDisabled();
    await expect(dialog.getByTestId("composer-workflow-done")).toContainText(DIR);
    const payload = await expectPromptPayloadContaining(marker);
    expect(payload.agent).toBe("build");
  });

  test("start DCA session: structured failure identifies the surviving session and disables retry", async ({ page }) => {
    const marker = `WF-ROOT-FAIL-${Date.now()}`;
    await fetch(`${MOCK_URL}/test/root-workflow-failure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "prompt", directory: DIR }) });
    const createsBefore = (await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as unknown[]).length;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="start-dca-session"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-root-assignment").fill(marker);
    await dialog.getByTestId("composer-workflow-root-isolated").uncheck();
    await dialog.getByTestId("composer-workflow-preview").click();
    await dialog.getByTestId("composer-workflow-root-start").click();
    await expect(dialog.getByTestId("composer-workflow-root-failure-stage")).toContainText("opening prompt submission");
    await expect(dialog.getByTestId("composer-workflow-open-partial-session")).toBeVisible();
    await expect(dialog.getByTestId("composer-workflow-root-attempt-guidance")).toContainText("Do not retry blindly");
    await expect(dialog.getByTestId("composer-workflow-root-attempt-guidance")).toContainText("does not survive a BFF restart");
    await expect(dialog.getByTestId("composer-workflow-root-start")).toBeDisabled();
    const createsAfter = (await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as unknown[]).length;
    expect(createsAfter - createsBefore).toBe(1);
  });

  test("start DCA session: ambiguous network failure disables retry and gives inspection guidance", async ({ page }) => {
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="start-dca-session"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-root-assignment").fill(`WF-ROOT-NETWORK-${Date.now()}`);
    await dialog.getByTestId("composer-workflow-root-isolated").uncheck();
    await dialog.getByTestId("composer-workflow-preview").click();
    await page.route("**/api/session-workflows/start?*", (route) => route.abort("connectionfailed"), { times: 1 });
    await dialog.getByTestId("composer-workflow-root-start").click();
    await expect(dialog.getByTestId("composer-workflow-error")).toBeVisible();
    const guidance = dialog.getByTestId("composer-workflow-root-attempt-guidance");
    await expect(guidance).toContainText("result is ambiguous");
    await expect(guidance).toContainText("Inspect the Hub, session list, and project worktrees first");
    await expect(guidance).toContainText("close and reopen");
    await expect(dialog.getByTestId("composer-workflow-root-start")).toBeDisabled();
  });

  test("managed child: Explore launches read-only with no authorization step", async ({ page }) => {
    const marker = `WF-EXPLORE-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="managed-child"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-field-objective").fill(marker);
    await dialog.getByTestId("composer-workflow-mode-explore").click();
    await dialog.getByTestId("composer-workflow-preview").click();

    // Read-only access needs no independent authorization, so Launch is live.
    await expect(dialog.getByTestId("composer-workflow-build-confirmation")).toHaveCount(0);
    await expect(dialog.getByTestId("composer-workflow-launch")).toBeEnabled();
    await dialog.getByTestId("composer-workflow-launch").click();
    await expect(dialog.getByTestId("composer-workflow-done")).toBeVisible();

    const sessionPayloads = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
    const created = sessionPayloads.find((item) => item.title === marker);
    expect(created).toBeDefined();
    expect(created!.agent).toBe("explore");
    expect(created!.parentID).toBe(MAIN);
    const payload = await expectPromptPayloadContaining(marker);
    expect(payload!.agent).toBe("explore");
    await dialog.getByTestId("composer-workflow-done-close").click();
  });

  test("managed child: General needs authorization and consent resets per agent", async ({ page }) => {
    const marker = `WF-GENERAL-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="managed-child"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-field-objective").fill(marker);

    // Consent given for Build must not carry over to General: the checkbox
    // authorizes one agent's access, not "can-modify" in general.
    await dialog.getByTestId("composer-workflow-mode-build").click();
    await dialog.getByTestId("composer-workflow-preview").click();
    await dialog.getByTestId("composer-workflow-build-confirm").check();
    await expect(dialog.getByTestId("composer-workflow-launch")).toBeEnabled();
    await dialog.getByTestId("composer-workflow-back").click();
    await dialog.getByTestId("composer-workflow-mode-general").click();
    await dialog.getByTestId("composer-workflow-preview").click();
    await expect(dialog.getByTestId("composer-workflow-build-confirmation")).toBeVisible();
    await expect(dialog.getByTestId("composer-workflow-build-confirm")).not.toBeChecked();
    await expect(dialog.getByTestId("composer-workflow-launch")).toBeDisabled();
    await expect(dialog.getByTestId("composer-workflow-agent-summary")).toContainText("General · can-modify");

    await dialog.getByTestId("composer-workflow-build-confirm").check();
    await dialog.getByTestId("composer-workflow-launch").click();
    await expect(dialog.getByTestId("composer-workflow-done")).toBeVisible();
    const sessionPayloads = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
    const created = sessionPayloads.find((item) => item.title === marker);
    expect(created!.agent).toBe("general");
    // General can modify, so the launch must have carried modify authorization
    // through to the creation-time ruleset.
    expect(created!.permission).toEqual(expect.arrayContaining([
      expect.objectContaining({ permission: "edit", pattern: "*", action: "allow" }),
    ]));
    await dialog.getByTestId("composer-workflow-done-close").click();
  });

  test("managed child: the model picker is the topmost layer and its choice reaches the child", async ({ page }) => {
    const marker = `WF-MODEL-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="managed-child"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-field-objective").fill(marker);

    // Defect 2: without portalLayer="nested" this panel renders at z-[90],
    // behind the z-[95] dialog, and is unclickable.
    await dialog.getByTestId("composer-workflow-model").click();
    const picker = page.getByTestId("composer-workflow-model-panel");
    await expect(picker).toBeVisible();
    const parentDialog = dialog.locator('[role="dialog"]');
    await expect(parentDialog).toHaveAttribute("aria-hidden", "true");
    expect(await parentDialog.evaluate((element) => element.inert)).toBe(true);
    await expect(picker.getByTestId("composer-workflow-model-search")).toBeFocused();
    expect(await picker.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 120));
      return top === element || element.contains(top);
    })).toBe(true);

    await picker.getByTestId("composer-workflow-model-search").fill("GPT-5.6 Sol");
    await picker.locator('[data-testid="composer-workflow-model-option"][data-model-key="openai/gpt-5.6-sol"]').click();
    await expect(parentDialog).not.toHaveAttribute("aria-hidden", "true");
    expect(await parentDialog.evaluate((element) => element.inert)).toBe(false);
    await expect(dialog.getByTestId("composer-workflow-model")).toHaveAttribute("value", "openai/gpt-5.6-sol");

    await dialog.getByTestId("composer-workflow-preview").click();
    await dialog.getByTestId("composer-workflow-launch").click();
    await expect(dialog.getByTestId("composer-workflow-done")).toBeVisible();

    const sessionPayloads = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
    const created = sessionPayloads.find((item) => item.title === marker);
    expect(created!.model).toMatchObject({ providerID: "openai", id: "gpt-5.6-sol" });
    const payload = await expectPromptPayloadContaining(marker);
    expect(payload!.model).toMatchObject({ providerID: "openai", modelID: "gpt-5.6-sol" });

    // And the provenance row in the parent's sub-agent panel reports it.
    await dialog.getByTestId("composer-workflow-done-close").click();
    await page.goto(`${mainSession}&panel=subagents`);
    const row = page.getByTestId("opencode-subagent-row").filter({ hasText: marker }).first();
    await expect(row).toHaveAttribute("data-origin", "managed-human");
    await expect(row.getByTestId("opencode-subagent-origin")).toHaveText("Managed Child");
    await expect(row.getByTestId("opencode-subagent-requested-model")).toContainText("openai/gpt-5.6-sol");
  });

  test("managed child: a catalogue failure keeps launch disabled and says so", async ({ page }) => {
    const marker = `WF-NOCAT-${Date.now()}`;
    await page.route("**/api/managed-child-agents?*", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Agent catalogue is temporarily unavailable" }),
    }));
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="managed-child"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-field-objective").fill(marker);

    // No verified agent means nothing safe to launch, and the reason is visible
    // rather than a silently dead button.
    await expect(dialog.getByTestId("composer-workflow-agent-error")).toContainText("Agent catalogue unavailable");
    await expect(dialog.getByTestId("composer-workflow-mode-plan")).toHaveCount(0);
    await expect(dialog.getByTestId("composer-workflow-preview")).toBeDisabled();
    const sessionPayloads = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
    expect(sessionPayloads.find((item) => item.title === marker)).toBeUndefined();
  });

  test("keeps the picker attachment out of an ordinary send", async ({ page }) => {
    const marker = `WF-PLAIN-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("opencode-composer").fill(marker);
    await page.getByTestId("opencode-send").click();
    const payload = await expectPromptPayloadContaining(marker);
    expect(promptText(payload!)).not.toContain("<workflow");
  });

  test("build mode requires its own authorization, and cancel abandons cleanly", async ({ page }) => {
    const marker = `WF-CANCELLED-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="managed-child"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await dialog.getByTestId("composer-workflow-field-objective").fill(marker);
    await dialog.getByTestId("composer-workflow-mode-build").click();
    await dialog.getByTestId("composer-workflow-preview").click();

    // Build launch stays disabled until the independent authorization is given.
    await expect(dialog.getByTestId("composer-workflow-launch")).toBeDisabled();
    await dialog.getByTestId("composer-workflow-build-confirm").check();
    await expect(dialog.getByTestId("composer-workflow-launch")).toBeEnabled();

    // Cancel from the preview: nothing was sent or launched.
    await dialog.getByTestId("composer-workflow-cancel").click();
    await expect(dialog).toHaveCount(0);
    expect(await promptPayloadContaining(marker)).toBeUndefined();
    const sessionPayloads = await (await fetch(`${MOCK_URL}/test/session-payloads`)).json() as Array<Record<string, unknown>>;
    expect(sessionPayloads.find((item) => item.title === marker)).toBeUndefined();
  });
});

test.describe("mobile composer collapse guard", () => {
  test.use({ viewport: { width: 390, height: 740 }, hasTouch: true });

  // Regression for the keyboard-open collapse: on a real touch device
  // `pointerdown` fires when the finger LANDS and the textarea `blur` fires
  // when it LIFTS, several frames later. The old excuse was disarmed one
  // animation frame after pointerdown, so by blur time it had always expired
  // and tapping Model / Reminder / Workflows collapsed the composer and
  // unmounted the picker it was opening. The waits below recreate that gap.
  test("pressing composer controls with the keyboard open never collapses the composer", async ({ page }) => {
    await page.goto(mainSession);
    const composer = page.getByTestId("opencode-composer");
    const collapsed = page.getByTestId("opencode-composer-expand");

    for (const control of ["composer-workflow-select", "composer-reminder-select", "opencode-composer-model"]) {
      await composer.tap();
      await expect(composer).toBeFocused();
      await page.getByTestId(control).dispatchEvent("pointerdown");
      await page.waitForTimeout(150); // finger still down; frames pass
      await composer.evaluate((element) => (element as HTMLTextAreaElement).blur());
      await page.waitForTimeout(80); // let the rAF collapse check run
      await expect(collapsed, `${control} press must not collapse the composer`).toHaveCount(0);
    }

    // A blur with no control press must still collapse (tapping the transcript).
    await composer.tap();
    await composer.evaluate((element) => (element as HTMLTextAreaElement).blur());
    await expect(collapsed).toBeVisible();
    await collapsed.tap();

    // And the full gesture: tapping Workflows opens the chooser with the
    // composer still expanded behind it.
    await composer.tap();
    await page.getByTestId("composer-workflow-select").tap();
    await expect(page.getByTestId("composer-workflow-panel")).toBeVisible();
    await expect(collapsed).toHaveCount(0);
    await page.getByTestId("composer-workflow-close").tap();
    await expect(composer).toBeVisible();
  });

  test("the independent-root form remains usable as a mobile sheet", async ({ page }) => {
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").tap();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="start-dca-session"]').tap();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("composer-workflow-root-assignment")).toBeFocused();
    await expect(dialog.getByTestId("composer-workflow-root-directory")).toContainText(DIR);
    await expect(dialog.getByTestId("composer-workflow-root-isolated")).toBeChecked();
    await dialog.getByTestId("composer-workflow-root-assignment").fill("Mobile root preview only");
    await dialog.getByTestId("composer-workflow-preview").tap();
    await expect(dialog.getByTestId("composer-workflow-root-start")).toBeVisible();
    await dialog.getByTestId("composer-workflow-cancel").tap();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(mainSession);
  });
});

test.describe("PR snippet review workflow", () => {
  test("takes only a pull request number, previews, and sends on the explicit action", async ({ page }) => {
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="pr-snippet-review"]').click();

    const dialog = page.getByTestId("composer-workflow-dialog");
    await expect(dialog).toHaveAttribute("data-workflow", "pr-snippet-review");
    // The form asks for one thing only.
    await expect(dialog.getByTestId("composer-workflow-field-pull-request")).toBeVisible();
    await expect(dialog.getByTestId("composer-workflow-field-route")).toHaveCount(0);

    // A non-number is refused rather than sent.
    await dialog.getByTestId("composer-workflow-field-pull-request").fill("not-a-pr");
    await expect(dialog.getByTestId("composer-workflow-pull-request-invalid")).toBeVisible();

    // A pasted URL from ANOTHER repository contributes only its number.
    await dialog.getByTestId("composer-workflow-field-pull-request").fill("https://github.com/attacker/other-repo/pull/253");
    await expect(dialog.getByTestId("composer-workflow-pull-request-invalid")).toHaveCount(0);
    await dialog.getByTestId("composer-workflow-preview").click();

    const preview = dialog.getByTestId("composer-workflow-prompt-preview");
    await expect(preview).toContainText("pull request #253");
    await expect(preview).toContainText("in this repository");
    await expect(preview).not.toContainText("attacker");
    await expect(preview).not.toContainText("other-repo");

    const injector = dialog.getByTestId("composer-workflow-injector");
    await expect(injector).toContainText('server-resolved from id "pr-snippet-review"');
    await expect(injector).toContainText("NEVER take a repository, owner, or host from the prompt");
    await expect(dialog.getByTestId("composer-workflow-post-note")).toContainText("Plan session will stop at the write");

    // Nothing has been sent until the explicit action.
    expect(await promptPayloadContaining("pull request #253")).toBeUndefined();
    await dialog.getByTestId("composer-workflow-send").click();
    await expect(dialog).toHaveCount(0);

    const payload = await promptPayloadContaining("pull request #253");
    expect(payload).toBeDefined();
    // The browser names the workflow by id; the server resolves the injector.
    expect(JSON.stringify(payload)).toContain("pr-snippet-review");
  });
});
