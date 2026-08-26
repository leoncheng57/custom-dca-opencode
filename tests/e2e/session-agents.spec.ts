import { expect, test } from "@playwright/test";

// This file owns its directory and both session fixtures. Foreign-agent
// prompting appends to the shared mock prompt log, so assertions here filter
// by this file's own session ids.
const DIR = process.platform === "darwin" ? "/private/tmp/mock-session-agents-project" : "/tmp/mock-session-agents-project";
const REVIEWER_SESSION = "ses_mock_agent_reviewer";
const DEPARTED_SESSION = "ses_mock_agent_departed";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;
const scoped = (path: string) => `/api${path}?directory=${encodeURIComponent(DIR)}`;

test("catalogues live session agents without hidden or delegation-only entries", async ({ request }) => {
  const response = await request.get(scoped("/session-agents"));
  expect(response.status()).toBe(200);
  const { agents } = await response.json() as { agents: Array<{ id: string; description?: string }> };
  const ids = agents.map((agent) => agent.id);
  expect(ids).toEqual(expect.arrayContaining(["plan", "build", "reviewer"]));
  // Hidden internals and subagent-only agents never reach the composer.
  expect(ids).not.toContain("secretive");
  expect(ids).not.toContain("explore");
  expect(ids).not.toContain("general");
});

test("prompts a foreign-identity session with its own agent and no policy patch", async ({ request }) => {
  const policyBefore = await (await fetch(`${MOCK_URL}/test/session-policy?id=${REVIEWER_SESSION}`)).json();
  const response = await request.post(scoped(`/sessions/${REVIEWER_SESSION}/prompt`), {
    data: { text: "Continue the review", agent: "reviewer" },
  });
  expect(response.status()).toBe(202);
  const prompts = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  const payload = prompts.find((item) => item.sessionID === REVIEWER_SESSION);
  expect(payload).toMatchObject({ agent: "reviewer" });
  // Identity preservation means no Plan/Build session rules were applied.
  expect(await (await fetch(`${MOCK_URL}/test/session-policy?id=${REVIEWER_SESSION}`)).json()).toEqual(policyBefore);
});

test("refuses to blend or remap identities", async ({ request }) => {
  const both = await request.post(scoped(`/sessions/${REVIEWER_SESSION}/prompt`), {
    data: { text: "No blending", agent: "reviewer", mode: "build" },
  });
  expect(both.status()).toBe(400);
  expect((await both.json()).error).toContain("exclusive");

  const planViaAgent = await request.post(scoped(`/sessions/${REVIEWER_SESSION}/prompt`), {
    data: { text: "Plan must use mode", agent: "plan" },
  });
  expect(planViaAgent.status()).toBe(400);
  expect((await planViaAgent.json()).error).toContain("mode");

  const buildViaAgent = await request.post(scoped(`/sessions/${REVIEWER_SESSION}/prompt`), {
    data: { text: "Build must use mode", agent: "build" },
  });
  expect(buildViaAgent.status()).toBe(400);
  expect((await buildViaAgent.json()).error).toContain("mode");

  // A roster agent that is not this session's identity must not take it over.
  const mismatch = await request.post(scoped(`/sessions/${DEPARTED_SESSION}/prompt`), {
    data: { text: "Do not switch this session", agent: "reviewer" },
  });
  expect(mismatch.status()).toBe(409);
  expect(await mismatch.json()).toMatchObject({ code: "SESSION_AGENT_MISMATCH", agent: "departed" });
});

test("fails loudly when the session's agent has left the roster", async ({ request }) => {
  const response = await request.post(scoped(`/sessions/${DEPARTED_SESSION}/prompt`), {
    data: { text: "This agent is gone", agent: "departed" },
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SESSION_AGENT_UNAVAILABLE", agent: "departed" });
  const prompts = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  expect(prompts.some((item) => item.sessionID === DEPARTED_SESSION)).toBe(false);
});

test("shows the fixed agent identity and sends with it from the composer", async ({ page }) => {
  await page.goto(`/sessions/${REVIEWER_SESSION}?directory=${encodeURIComponent(DIR)}`);
  const chip = page.getByTestId("opencode-session-agent-fixed");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("reviewer");
  await expect(chip).toHaveAttribute("data-available", "true");
  await expect(page.getByTestId("opencode-composer-mode")).toHaveCount(0);
  await page.getByTestId("opencode-composer").fill("Composer follow-up for the reviewer agent");
  await page.getByTestId("opencode-send").click();
  await expect(page.getByTestId("opencode-composer")).toHaveValue("");
  await expect.poll(async () => {
    const prompts = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
    return prompts.find((item) => (item.parts as Array<{ text?: string }> | undefined)
      ?.some((part) => part.text === "Composer follow-up for the reviewer agent"));
  }).toMatchObject({ agent: "reviewer", sessionID: REVIEWER_SESSION });
});

test("keeps the composer closed with an honest message for a vanished agent", async ({ page }) => {
  await page.goto(`/sessions/${DEPARTED_SESSION}?directory=${encodeURIComponent(DIR)}`);
  const chip = page.getByTestId("opencode-session-agent-fixed");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-available", "false");
  await expect(page.getByTestId("opencode-send")).toBeDisabled();
  await expect(page.getByTestId("opencode-current-model")).toContainText("not available on the connected server");
});
