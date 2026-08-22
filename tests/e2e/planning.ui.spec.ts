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
});
