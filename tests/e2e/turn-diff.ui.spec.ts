import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function openModal(page: Page) {
  const card = page.getByTestId("opencode-changed-files-card");
  await clickCentered(card.getByTestId("opencode-turn-diff-toggle"));
  return page.getByTestId("opencode-change-modal");
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

  test("renders no patch inline and opens one modal that names its scope", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/sessions/ses_mock_done/diff?")) requests.push(request.url());
    });

    await page.goto(conversation);
    const card = page.getByTestId("opencode-changed-files-card");
    await expect(card).toContainText("2 files changed");
    await expect(card.getByTestId("opencode-changed-files-names")).toHaveText("server/index.ts, tests/health.test.ts");
    await expect(card.getByTestId("opencode-turn-diff-toggle")).toHaveText("View changes");
    // The inline card is a milestone, never a diff viewer.
    await expect(page.getByTestId("opencode-change-modal-patch")).toHaveCount(0);
    expect(requests).toHaveLength(0);

    const order = await page.locator("[data-event-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")));
    expect(order.indexOf("prt_patch_001")).toBe(order.indexOf("prt_text_002") + 1);

    const modal = await openModal(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("opencode-change-modal-count")).toHaveText("2 files changed");
    await expect(modal.getByTestId("opencode-change-modal-scope")).toHaveText("Exact historical turn diff");
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]).searchParams.get("userMessageID")).toBe("msg_user_001");

    await expect(modal.getByTestId("opencode-change-modal-active-file")).toHaveText("src/index.ts");
    await expect(modal.getByTestId("opencode-change-modal-patch")).toContainText("+new");
  });

  test("selects files from the rail and navigates between them", async ({ page }) => {
    await page.route(diffPattern, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        changes: [
          { file: "server/index.ts", patch: "@@ -1 +1 @@\n-old server\n+new server", additions: 1, deletions: 1, status: "modified" },
          { file: "tests/health.test.ts", patch: "@@ -0,0 +1 @@\n+added test", additions: 1, deletions: 0, status: "added" },
        ],
      }),
    }));

    await page.goto(conversation);
    const modal = await openModal(page);
    await expect(modal.getByTestId("opencode-change-modal-file")).toHaveCount(2);
    await expect(modal.getByTestId("opencode-change-modal-position")).toHaveText("File 1 of 2");
    await expect(modal.getByTestId("opencode-change-modal-patch")).toContainText("+new server");
    await expect(modal.getByTestId("opencode-change-modal-previous")).toBeDisabled();

    await modal.getByTestId("opencode-change-modal-next").click();
    await expect(modal.getByTestId("opencode-change-modal-active-file")).toHaveText("tests/health.test.ts");
    await expect(modal.getByTestId("opencode-change-modal-patch")).toContainText("+added test");
    await expect(modal.getByTestId("opencode-change-modal-next")).toBeDisabled();

    await modal.getByTestId("opencode-change-modal-file").first().click();
    await expect(modal.getByTestId("opencode-change-modal-active-file")).toHaveText("server/index.ts");
    await expect(modal.getByTestId("opencode-change-modal-position")).toHaveText("File 1 of 2");
  });

  test("reveals a long patch in chunks rather than all at once", async ({ page }) => {
    await page.route(diffPattern, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        changes: [{
          file: "server/index.ts",
          patch: `@@ -1 +1 @@\n${Array.from({ length: 900 }, (_, index) => `+line-${index}`).join("\n")}`,
          additions: 900,
          deletions: 0,
          status: "modified",
        }],
      }),
    }));

    await page.goto(conversation);
    const modal = await openModal(page);
    const patch = modal.getByTestId("opencode-change-modal-patch");
    await expect(patch).toContainText("+line-0");
    await expect(patch).not.toContainText("+line-800");
    await expect(modal.getByTestId("opencode-change-modal-remaining")).toContainText("more lines");

    await modal.getByTestId("opencode-change-modal-load-more").click();
    await expect(patch).toContainText("+line-800");
    await expect(modal.getByTestId("opencode-change-modal-load-more")).toHaveCount(0);
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
    const modal = await openModal(page);
    await expect(modal.getByTestId("opencode-change-modal-error")).toContainText("diff service unavailable");
    await expect(modal.getByTestId("opencode-change-modal-scope")).toHaveText("Historical diff unavailable");

    await modal.getByTestId("opencode-change-modal-retry").click();
    await expect(modal.getByTestId("opencode-change-modal-empty")).toHaveText("No file changes were returned for this turn.");
    expect(attempts).toBe(2);
  });

  test("keeps an oversized turn in the same modal, naming files without inventing a patch", async ({ page }) => {
    await page.route(diffPattern, (route) => route.fulfill({
      status: 413,
      contentType: "application/json",
      body: JSON.stringify({ error: "Turn diff exceeds safe response limits", code: "TURN_DIFF_TOO_LARGE", limits: { files: 50, characters: 120_000, lines: 3_000 } }),
    }));

    await page.goto(conversation);
    const modal = await openModal(page);
    await expect(modal.getByTestId("opencode-change-modal-scope")).toHaveText("Historical diff unavailable");
    await expect(modal.getByTestId("opencode-change-modal-too-large")).toContainText("did not send its patch body");
    // The rail is still useful: naming what changed is answerable.
    await expect(modal.getByTestId("opencode-change-modal-file")).toHaveCount(2);
    await expect(modal.getByTestId("opencode-change-modal-patch")).toHaveCount(0);
    await expect(modal.getByTestId("opencode-change-modal-error")).toHaveCount(0);

    // The fallback must never be presented as the historical change.
    await expect(modal.getByTestId("opencode-change-modal-workspace-caveat")).toContainText("not a record of this turn");
    await modal.getByTestId("opencode-change-modal-workspace").click();
    await expect(page.getByTestId("opencode-workspace-panels")).toBeVisible();
    await expect(page.getByTestId("opencode-workspace-changes")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("opencode-change-modal")).toHaveCount(0);
  });

  test("closes on Escape and restores focus to the transcript control", async ({ page }) => {
    await page.goto(conversation);
    const modal = await openModal(page);
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("opencode-change-modal")).toHaveCount(0);
    await expect(page.getByTestId("opencode-turn-diff-toggle")).toBeFocused();
  });

  test("cancels an in-flight request when the modal closes", async ({ page }) => {
    let attempts = 0;
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => { releaseFirst = resolve; });
    await page.route(diffPattern, async (route) => {
      attempts += 1;
      const patch = attempts === 1 ? "+stale" : "+current";
      if (attempts === 1) await firstReleased;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ changes: [{ file: "src/index.ts", patch, additions: 1, deletions: 0, status: "modified" }] }),
      }).catch(() => undefined);
    });

    await page.goto(conversation);
    const modal = await openModal(page);
    await expect(modal.getByRole("status")).toHaveText("Loading changes...");
    await modal.getByTestId("opencode-change-modal-close").click();
    await expect(page.getByTestId("opencode-change-modal")).toHaveCount(0);

    const reopened = await openModal(page);
    await expect(reopened.getByTestId("opencode-change-modal-patch")).toContainText("+current");
    releaseFirst?.();
    await page.waitForTimeout(50);
    await expect(reopened.getByTestId("opencode-change-modal-patch")).toContainText("+current");
    await expect(reopened.getByTestId("opencode-change-modal-patch")).not.toContainText("+stale");
    expect(attempts).toBe(2);
  });

  test("fits long names and patch lines inside the phone modal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.route("**/api/sessions/ses_mock_done/messages?**", async (route) => {
      const response = await route.fetch();
      const body = await response.json() as {
        messages: Array<{ parts?: Array<{ type?: string; files?: string[] }> }>;
      };
      const patch = body.messages.flatMap((message) => message.parts ?? []).find((part) => part.type === "patch");
      if (patch) {
        patch.files = Array.from({ length: 12 }, (_, index) =>
          `generated/${index}/${"nested-segment/".repeat(30)}file-${index}.ts`
        );
      }
      await route.fulfill({ response, json: body });
    });
    await page.route(diffPattern, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        changes: [{
          file: `generated/${"deep/".repeat(80)}long-name.ts`,
          patch: `@@ -1 +1 @@\n-${"a".repeat(8_000)}\n+${"b".repeat(8_000)}`,
          additions: 1,
          deletions: 1,
          status: "modified",
        }],
      }),
    }));

    await page.goto(conversation);
    const card = page.getByTestId("opencode-changed-files-card");
    await expect(card).toContainText("12 files changed");
    await expect(card.getByTestId("opencode-changed-files-names")).toContainText("more");

    const modal = await openModal(page);
    const patch = modal.getByTestId("opencode-change-modal-patch");
    await expect(patch).toContainText("+bbbb");

    const modalBox = await modal.boundingBox();
    expect((modalBox?.x ?? 0) + (modalBox?.width ?? 0)).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    // A hostile single line scrolls inside its own pane instead of the page.
    const patchOverflow = await patch.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(patchOverflow).toBeGreaterThan(0);
  });
});
