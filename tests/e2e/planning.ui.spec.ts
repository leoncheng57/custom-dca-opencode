import { expect, test } from "@playwright/test";

test.describe("project planning", () => {
  test("lists issues and pull requests with labels and both dates", async ({ page }) => {
    await page.goto("/planning");

    await expect(page.getByTestId("opencode-planning")).toBeVisible();
    await expect(page.getByTestId("opencode-planning-list")).toBeVisible();
    await expect(page.getByTestId("opencode-planning-row")).toHaveCount(2);
    await expect(page.getByText("Improve the mobile planning view")).toBeVisible();
    await expect(page.getByText("Add the project planning feed")).toBeVisible();
    await expect(page.getByText("frontend")).toBeVisible();
    await expect(page.getByText("Created Aug 12, 2026")).toBeVisible();
    await expect(page.getByText("Last activity Aug 21, 2026")).toBeVisible();

    const issueLink = page.getByTestId("opencode-planning-item-101");
    await expect(issueLink).toHaveAttribute("href", "https://github.com/leoncheng57/custom-dca-opencode/issues/101");
    await expect(issueLink).toHaveAttribute("target", "_blank");
    await expect(issueLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("filters by type and state and identifies merged pull requests", async ({ page }) => {
    await page.goto("/planning");
    await expect(page.getByTestId("opencode-planning-list")).toBeVisible();

    await page.getByTestId("opencode-planning-type-pull_request").click();
    await expect(page.getByTestId("opencode-planning-row")).toHaveCount(1);
    await expect(page.getByText("Add the project planning feed")).toBeVisible();

    await page.getByTestId("opencode-planning-state-closed").click();
    await expect(page.getByTestId("opencode-planning-row")).toHaveCount(1);
    await expect(page.getByText("Ship session-first notifications")).toBeVisible();
    await expect(page.getByText("Merged", { exact: true })).toBeVisible();

    await page.getByTestId("opencode-planning-state-all").click();
    await expect(page.getByTestId("opencode-planning-row")).toHaveCount(2);
  });

  test("shows a sanitized API error", async ({ page }) => {
    await page.route("**/api/planning/items", async (route) => {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Rate limited" }) });
    });
    await page.goto("/planning");
    await expect(page.getByRole("alert")).toHaveText("Planning data is unavailable: Rate limited");
  });

  test("fits the list at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto("/planning");
    await expect(page.getByTestId("opencode-planning-list")).toBeVisible();

    const metrics = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
    await expect(page.getByText("Created Aug 12, 2026")).toBeVisible();
    await expect(page.getByText("Last activity Aug 21, 2026")).toBeVisible();
  });

  test("creates an issue with selected labels and restores focus", async ({ page }) => {
    await page.goto("/planning");
    const trigger = page.getByTestId("opencode-planning-create");
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Create issue" })).toBeVisible();
    await expect(page.getByTestId("opencode-planning-create-title")).toBeFocused();
    await expect(page.getByTestId("opencode-planning-label-list")).toContainText("frontend");

    await page.getByTestId("opencode-planning-create-title").fill("Create issues from planning");
    await page.getByTestId("opencode-planning-create-body").fill("## Context\n\nCreated from the runner.");
    await page.getByTestId("opencode-planning-label-frontend").check();
    await page.getByTestId("opencode-planning-create-submit").click();

    await expect(page.getByTestId("opencode-planning-create-dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByTestId("opencode-planning-create-success")).toContainText("Issue #103 created");
    await expect(page.getByTestId("opencode-planning-created-link"))
      .toHaveAttribute("href", "https://github.com/leoncheng57/custom-dca-opencode/issues/103");
    const createdRow = page.getByTestId("opencode-planning-row").filter({ hasText: "Create issues from planning" });
    await expect(createdRow).toBeVisible();
    await expect(createdRow.getByText("frontend")).toBeVisible();
  });

  test("prevents duplicate submits and preserves a failed draft", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/planning/issues", async (route) => {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "Rejected by GitHub" }) });
    });
    await page.goto("/planning?create=1");
    const title = page.getByTestId("opencode-planning-create-title");
    const body = page.getByTestId("opencode-planning-create-body");
    await title.fill("Keep this draft");
    await body.fill("Do not discard this body.");

    await page.getByTestId("opencode-planning-create-form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect(page.getByTestId("opencode-planning-create-submit")).toBeDisabled();
    await expect(page.getByTestId("opencode-planning-create-submit")).toHaveText("Creating...");
    await expect(page.getByTestId("opencode-planning-create-error")).toHaveText("Rejected by GitHub");
    expect(requests).toBe(1);
    await expect(title).toHaveValue("Keep this draft");
    await expect(body).toHaveValue("Do not discard this body.");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("opencode-planning-create-dialog")).toHaveCount(0);
  });

  test("keeps the create dialog usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto("/planning?create=1");
    await expect(page.getByTestId("opencode-planning-create-dialog")).toBeVisible();
    const metrics = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
    await expect(page.getByTestId("opencode-planning-create-submit")).toBeVisible();
  });
});
