import { expect, test } from "@playwright/test";

test("serves an interactive, credential-free PR simulator", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  expect(pageErrors).toEqual([]);
  await expect(page.getByTestId("opencode-public-simulator-banner")).toContainText("fixture data only");
  await expect(page.getByTestId("opencode-upstream-badge")).toContainText("1.18.22");
  await expect(page.getByTestId("opencode-session-list")).toContainText("Build the PR preview pipeline");

  await page.getByTestId("opencode-session-list").getByText("Build the PR preview pipeline").click();
  await expect(page).toHaveURL(/#\/sessions\/ses_preview_done/u);
  await expect(page.getByTestId("opencode-transcript")).toContainText("All verification passed");
  await expect(page.getByTestId("opencode-todo-list")).toContainText("Review the PR deployment");

  const composer = page.getByTestId("opencode-composer");
  await composer.fill("Demonstrate the simulated follow-up");
  await page.getByTestId("opencode-send").click();
  await expect(composer).toHaveValue("");
  await expect(page.getByTestId("opencode-transcript")).toContainText("No model or external service was called");

  await page.getByTestId("opencode-file-reference").filter({ hasText: "server/index.ts:98" }).click();
  await expect(page.getByTestId("opencode-workspace-panels")).toBeVisible();
  await page.getByTestId("opencode-workspace-preview").click();
  await expect(page.getByTestId("opencode-preview-frame").contentFrame().getByRole("heading"))
    .toHaveText("Simulated application preview");
  await page.getByTestId("opencode-workspace-close").click();

  await page.getByTestId("opencode-nav-more").click();
  await page.getByTestId("opencode-nav-planning").click();
  await expect(page).toHaveURL(/#\/planning/u);
  await expect(page.getByTestId("opencode-planning-list")).toContainText("Use GitHub's deployment infra");
});
