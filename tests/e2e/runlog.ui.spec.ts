import { expect, test } from "@playwright/test";

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;

test.describe("Run log activity timeline", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/permission-requests?**", (route) => route.fulfill({ json: { requests: [] } }));
    await page.route("**/api/sessions/ses_mock_done/questions?**", (route) => route.fulfill({ json: { requests: [] } }));
  });

  test("orders, filters, and jumps to edit and failure activity", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(conversation);
    await page.getByTestId("opencode-inspector-runlog").click();

    const panel = page.getByTestId("opencode-command-list");
    const rows = panel.getByTestId("opencode-command-row");
    await expect(rows).toHaveCount(4);
    expect(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-activity-id")))).toEqual([
      "prt_patch_001",
      "prt_tool_001",
      "prt_tool_002",
      "prt_tool_003",
    ]);

    await panel.getByTestId("opencode-runlog-filter-edit").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Changed");
    await expect(rows.first()).toContainText("2 files: server/index.ts, tests/health.test.ts");
    await expect(rows.first()).toContainText("ok");
    await expect(rows.first().locator("time")).not.toBeEmpty();
    await rows.first().click();
    await expect(page.locator('[data-event-id="prt_patch_001"]')).toBeFocused();

    await panel.getByTestId("opencode-runlog-filter-failure").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-status", "error");
    await expect(rows.first()).toContainText("getaddrinfo ENOTFOUND example.invalid");

    await panel.getByTestId("opencode-runlog-filter-read").click();
    await expect(rows).toHaveCount(2);
    await panel.getByTestId("opencode-runlog-filter-command").click();
    await expect(rows).toHaveCount(1);
    await panel.getByTestId("opencode-runlog-filter-other").click();
    await expect(rows).toHaveCount(0);
    await expect(panel.getByTestId("opencode-runlog-empty")).toHaveText("No other tools in this run.");
    await expect(panel).toContainText("0 of 4 events");
  });

  test("keeps timeline filters and edit navigation usable in the mobile sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(conversation);
    await page.getByTestId("opencode-mobile-runlog-open").click();

    const sheet = page.getByTestId("opencode-mobile-inspector");
    const panel = sheet.getByTestId("opencode-command-list");
    await panel.getByTestId("opencode-runlog-filter-edit").click();
    const edit = panel.getByTestId("opencode-command-row");
    await expect(edit).toContainText("Changed");
    await expect(edit).toContainText("2 files");
    expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

    await edit.click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-event-id="prt_patch_001"]')).toBeFocused();
  });
});
