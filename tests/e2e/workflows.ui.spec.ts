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

async function promptPayloadContaining(fragment: string): Promise<Record<string, unknown> | undefined> {
  const payloads = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  return payloads.find((item) => {
    const parts = item.parts as Array<{ type?: string; text?: string }> | undefined;
    return parts?.some((part) => part.type === "text" && part.text?.includes(fragment));
  });
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
  test("exposes exactly the three workflows with visible injector text", async ({ request }) => {
    const response = await request.get("/api/workflows");
    expect(response.status()).toBe(200);
    const payload = await response.json() as { workflows: Array<Record<string, unknown>> };
    expect(payload.workflows.map((workflow) => workflow.id)).toEqual([
      "playwright-ui-review",
      "session-update",
      "managed-child",
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
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toContainText("Review a UI change with Playwright");
    await expect(options.nth(1)).toContainText("Send an update to another session");
    await expect(options.nth(2)).toContainText("Launch a Managed Child");

    // Choosing a workflow opens its form — it never sends.
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="playwright-ui-review"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-workflow", "playwright-ui-review");
    await expect(dialog).toContainText("without a full deployment or a complete screenshot regeneration");
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

  test("session update: target preview, explicit send, accepted is not completed", async ({ page }) => {
    const marker = `WF-UPDATE-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="session-update"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");

    // The current session is not offered as its own target.
    const select = dialog.getByTestId("composer-workflow-field-session");
    await expect(select.locator(`option[value="${TARGET}"]`)).toHaveText(`Workflow update target (${TARGET})`);
    await expect(select.locator(`option[value="${MAIN}"]`)).toHaveCount(0);
    await select.selectOption(TARGET);
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

  test("managed child: explains the contract, launches only on explicit confirm", async ({ page }) => {
    const marker = `WF-CHILD-${Date.now()}`;
    await page.goto(mainSession);
    await page.getByTestId("composer-workflow-select").click();
    await page.locator('[data-testid="composer-workflow-option"][data-workflow-id="managed-child"]').click();
    const dialog = page.getByTestId("composer-workflow-dialog");

    await dialog.getByTestId("composer-workflow-field-objective").fill(marker);
    await expect(dialog.getByTestId("composer-workflow-mode-plan")).toHaveAttribute("aria-pressed", "true");
    const notes = dialog.getByTestId("composer-workflow-managed-notes");
    await expect(notes).toContainText("independent transcript");
    await expect(notes).toContainText("fixed at creation time");
    await expect(notes).toContainText("No native task card");
    await expect(notes).toContainText("No automatic hand-back");
    await dialog.getByTestId("composer-workflow-preview").click();

    await expect(dialog.getByTestId("composer-workflow-prompt-preview")).toHaveText(marker);
    await expect(dialog.getByTestId("composer-workflow-injector")).toContainText("managed child session");
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
});
