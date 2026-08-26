import { expect, test } from "@playwright/test";

test.describe("Playbooks", () => {
  test("is first-class navigation beside Docs and Planning", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("opencode-nav-more").click();
    await page.getByTestId("opencode-nav-playbooks").click();

    await expect(page).toHaveURL("/playbooks");
    await expect(page).toHaveTitle("Playbooks | DCA");
    await expect(page.getByRole("heading", { name: "Repeatable ways to work with an agent." })).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-skill-card")).toHaveCount(13);
    await expect(page.getByTestId("opencode-playbook-command-card")).toHaveCount(15);
  });

  test("filters by tag and opens a skill with simulation and installation", async ({ page }) => {
    await page.goto("/playbooks/skills");
    await page.getByTestId("opencode-playbook-filter").fill("critique");
    await expect(page.getByTestId("opencode-playbook-skill-card")).toHaveCount(2);

    await page.getByTestId("opencode-playbook-skill-grill-me").click();
    await expect(page).toHaveURL("/playbooks/skills/grill-me");
    await expect(page).toHaveTitle("Skill | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-simulation")).toBeVisible();
    await page.getByText("Install grill-me", { exact: true }).click();
    await expect(page.getByText("npx skills add", { exact: false }).first()).toBeVisible();
  });

  test("shows command relationships and remains usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto("/playbooks/commands/verify");

    await expect(page).toHaveTitle("Command | Playbooks | DCA");
    await expect(page.getByRole("heading", { name: "/verify" })).toBeVisible();
    await expect(page.getByRole("link", { name: "human-verification-steps" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
