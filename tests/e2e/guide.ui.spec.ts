import { expect, test } from "@playwright/test";

test("guide uses fictional scenes, stable deep links, and no application API", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/guide#simulation-subagent-ledger");

  await expect(page.getByRole("heading", { name: "Child state is derived from evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unknown is a first-class answer" })).toBeVisible();
  await expect(page.getByTestId("guide-simulator")).toContainText("Cancelled dependency audit");
  await expect(page.getByTestId("guide-simulator")).toContainText("No terminal evidence");
  expect(apiRequests).toEqual([]);
});

test("guide supports chapter navigation, simulated actions, and mobile preview", async ({ page }) => {
  await page.goto("/guide");

  await page.getByTestId("guide-chapter-human-gates").click();
  await expect(page).toHaveURL(/#simulation-permission-question$/);
  await expect(page.getByTestId("guide-simulator")).toContainText("Run the focused test suite?");

  await page.getByTestId("guide-action-permission-question-0").click();
  await expect(page.getByRole("status").filter({ hasText: "Allow once: simulated only" })).toBeVisible();

  await page.getByTestId("guide-viewport-mobile").click();
  const simulator = page.getByTestId("guide-simulator");
  await expect(simulator).toHaveClass(/guide-simulator-mobile/);
  expect((await simulator.boundingBox())?.width).toBeLessThanOrEqual(390);

  await page.getByTestId("guide-next").click();
  await expect(page).toHaveURL(/#simulation-auto-permissions$/);
  await expect(page.getByRole("heading", { name: "Permissions, questions, and review stay distinct" })).toBeVisible();
});

test("guide remains usable at a phone viewport without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto("/guide#simulation-phone-handoff");

  await expect(page.getByRole("heading", { name: "Hand off the same session to a phone" })).toBeVisible();
  await expect(page.getByTestId("guide-simulator")).toContainText("No third-party network request");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(740);
});
