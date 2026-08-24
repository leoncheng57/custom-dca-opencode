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
      "prt_tool_001",
      "prt_patch_001",
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

  test("expands a collapsed action group before jumping to its exact tool", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route("**/api/sessions/ses_mock_done/messages?**", (route) => route.fulfill({
      json: {
        messages: [
          {
            info: { id: "msg_group_user", role: "user", agent: "build", time: { created: 1787000000000 } },
            parts: [{ id: "prt_group_prompt", messageID: "msg_group_user", type: "text", text: "Run checks" }],
          },
          {
            info: { id: "msg_group_agent", role: "assistant", parentID: "msg_group_user", mode: "build", time: { created: 1787000001000, completed: 1787000005000 } },
            parts: ["one", "two", "three"].map((name, index) => ({
              id: `prt_group_${name}`,
              messageID: "msg_group_agent",
              type: "tool",
              tool: "bash",
              state: {
                status: "completed",
                input: { command: `echo ${name}` },
                output: name,
                title: name,
                metadata: {},
                time: { start: 1787000002000 + index * 100, end: 1787000002050 + index * 100 },
              },
            })),
          },
        ],
        nextCursor: null,
      },
    }));

    await page.goto(conversation);
    const group = page.getByTestId("opencode-action-group");
    await expect(group).toHaveCount(1);
    await group.getByTestId("opencode-action-group-toggle").click();
    await expect(page.locator('[data-event-id="prt_group_two"]')).toHaveCount(0);

    await page.getByTestId("opencode-inspector-runlog").click();
    const row = page.getByTestId("opencode-command-row").filter({ hasText: "echo two" });
    await row.click();

    await expect(group.getByTestId("opencode-action-group-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[data-event-id="prt_group_two"]')).toBeFocused();
  });
});
