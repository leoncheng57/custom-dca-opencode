import { expect, test } from "@playwright/test";

test.describe("experimental DSH workspace", () => {
  async function createSession(page: import("@playwright/test").Page) {
    await page.goto("/dsh");
    await expect(page.getByTestId("dsh-home")).toBeVisible();
    await page.getByTestId("dsh-create").click();
    await expect(page).toHaveURL(/\/dsh\/sessions\/dsh-/);
  }

  test("creates a read-only session and renders streamed output", async ({ page }) => {
    await createSession(page);
    await expect(page.getByText("Read only", { exact: true }).first()).toBeVisible();
    await page.getByTestId("dsh-prompt").fill("Inspect this fixture");
    await page.getByTestId("dsh-send").click();
    await expect(page.getByTestId("opencode-agent-message-body")).toContainText("Hello from mock DSH");
    await expect(page.getByTestId("dsh-prompt")).toBeEnabled();
  });

  test("opens the existing bounded preview experience", async ({ page }) => {
    await createSession(page);
    await page.getByTestId("dsh-open-preview").click();
    await expect(page.getByTestId("dsh-preview")).toBeVisible();
    await expect(page.getByTestId("dsh-preview-frame")).toHaveAttribute("sandbox", "allow-forms allow-modals allow-popups allow-scripts");
  });

  test("keeps the interactive controls usable at the phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await createSession(page);
    await expect(page.getByTestId("dsh-prompt")).toBeInViewport();
    await expect(page.getByTestId("dsh-send")).toBeInViewport();
    await page.getByTestId("dsh-open-preview").click();
    await expect(page.getByTestId("dsh-preview")).toHaveCSS("width", "390px");
  });

  test("cancels a running DSH turn and reopens the composer", async ({ page }) => {
    await createSession(page);
    await page.getByTestId("dsh-prompt").fill("stay running until cancelled");
    await page.getByTestId("dsh-send").click();
    await expect(page.getByTestId("dsh-cancel")).toBeVisible();
    await page.getByTestId("dsh-cancel").click();
    await expect(page.getByText("Cancelled by user")).toBeVisible();
    await expect(page.getByTestId("dsh-prompt")).toBeEnabled();
  });
});
