import { expect, test, type Locator } from "@playwright/test";

const DIR = "/tmp/mock-project";
const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;
const diffPattern = "**/api/sessions/ses_mock_done/diff?**";

async function clickCentered(locator: Locator) {
  const page = locator.page();
  await page.getByTestId("opencode-transcript").evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollTop - 600);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await locator.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await locator.click();
}

test.describe("transcript turn diff", () => {
  test.beforeEach(async ({ page }) => {
    // Keep this spec independent of the seeded permission/question fixtures;
    // those are owned and mutated by smoke.ui.spec.ts.
    await page.route("**/api/permission-requests?**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requests: [] }),
    }));
    await page.route("**/api/sessions/ses_mock_done/questions?**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requests: [] }),
    }));
  });

  test("stays collapsed, fetches lazily, and keeps the patch milestone in part order", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/sessions/ses_mock_done/diff?")) requests.push(request.url());
    });

    await page.goto(conversation);
    const card = page.getByTestId("opencode-changed-files-card");
    await expect(card).toContainText("2 files changed");
    await expect(card.getByTestId("opencode-changed-files-names")).toHaveText("server/index.ts, tests/health.test.ts");
    await expect(card.getByTestId("opencode-turn-diff-toggle")).toHaveText("View changes");
    await expect(card.getByTestId("opencode-turn-diff-panel")).toHaveCount(0);
    expect(requests).toHaveLength(0);

    const order = await page.locator("[data-event-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")));
    expect(order.indexOf("prt_patch_001")).toBe(order.indexOf("prt_text_002") + 1);

    await clickCentered(card.getByTestId("opencode-turn-diff-toggle"));
    await expect(card.getByTestId("opencode-turn-diff-content")).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]).searchParams.get("userMessageID")).toBe("msg_user_001");
    await expect(card.getByTestId("opencode-turn-diff-file")).toContainText("src/index.ts");
    await expect(card.getByTestId("opencode-turn-diff-file")).toContainText("modified");
    await expect(card.getByTestId("opencode-turn-diff-file")).toContainText("+1");
    await expect(card.getByTestId("opencode-turn-diff-file")).toContainText("-1");
    await expect(card.getByTestId("opencode-turn-diff-patch")).toContainText("+new");

    await clickCentered(card.getByTestId("opencode-turn-diff-toggle"));
    await expect(card.getByTestId("opencode-turn-diff-panel")).toHaveCount(0);
    await clickCentered(card.getByTestId("opencode-turn-diff-toggle"));
    await expect(card.getByTestId("opencode-turn-diff-content")).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  test("shows an actionable error and an honest empty response", async ({ page }) => {
    let attempts = 0;
    await page.route(diffPattern, async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "diff service unavailable" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ changes: [] }) });
    });

    await page.goto(conversation);
    const card = page.getByTestId("opencode-changed-files-card");
    await clickCentered(card.getByTestId("opencode-turn-diff-toggle"));
    await expect(card.getByTestId("opencode-turn-diff-error")).toContainText("diff service unavailable");
    await clickCentered(card.getByTestId("opencode-turn-diff-retry"));
    await expect(card.getByTestId("opencode-turn-diff-empty")).toHaveText("No file changes were returned for this turn.");
    expect(attempts).toBe(2);
  });

  test("bounds oversized patches instead of partially presenting them", async ({ page }) => {
    await page.route(diffPattern, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        changes: [{ file: "generated/large.ts", patch: `@@ -1 +1 @@\n-${"a".repeat(60_001)}\n+${"b".repeat(60_001)}`, additions: 1, deletions: 1, status: "modified" }],
      }),
    }));

    await page.goto(conversation);
    const card = page.getByTestId("opencode-changed-files-card");
    await clickCentered(card.getByTestId("opencode-turn-diff-toggle"));
    await expect(card.getByTestId("opencode-turn-diff-too-large")).toContainText("too large to render safely");
    await expect(card.getByTestId("opencode-turn-diff-patch")).toHaveCount(0);
  });

  test("fits the phone transcript without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(conversation);
    const card = page.getByTestId("opencode-changed-files-card");
    await expect(card).toBeVisible();
    const [cardBox, toggleBox] = await Promise.all([
      card.boundingBox(),
      card.getByTestId("opencode-turn-diff-toggle").boundingBox(),
    ]);
    expect(toggleBox?.y).toBeGreaterThan(cardBox?.y ?? 0);
    expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
