import { expect, test } from "@playwright/test";

test.describe("Playbooks", () => {
  test("is first-class navigation beside Docs and Planning", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("opencode-nav-more").click();
    await page.getByTestId("opencode-nav-playbooks").click();

    await expect(page).toHaveURL("/playbooks");
    await expect(page).toHaveTitle("Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbooks-wip-warning")).toHaveText("Playbooks is still work in progress and its UI/UX may contain bugs.");
    await expect(page.getByRole("heading", { name: "Repeatable ways to work with an agent." })).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-skill-card")).toHaveCount(15);
    await expect(page.getByTestId("opencode-playbook-command-card")).toHaveCount(17);
  });

  test("filters by tag and opens a skill with simulation and installation", async ({ page }) => {
    await page.goto("/playbooks/skills");
    await page.getByTestId("opencode-playbook-filter").fill("critique");
    await expect(page.getByTestId("opencode-playbook-skill-card")).toHaveCount(2);

    await page.getByTestId("opencode-playbook-skill-grill-me").click();
    await expect(page).toHaveURL("/playbooks/skills/grill-me");
    await expect(page).toHaveTitle("Skill | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-dialog")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-dialog").getByTestId("opencode-playbooks-wip-warning")).toHaveText("Playbooks is still work in progress and its UI/UX may contain bugs.");
    await expect(page.getByTestId("opencode-playbooks")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-simulation")).toBeVisible();
    await page.getByText("Install grill-me", { exact: true }).click();
    await expect(page.getByText("npx skills add", { exact: false }).first()).toBeVisible();
  });

  test("closes a direct detail URL back to the all-playbooks catalogue", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/playbooks/skills/ascii-diagrams");
    const dialog = page.getByTestId("opencode-playbook-dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box!.x + box!.width / 2) - 640)).toBeLessThanOrEqual(2);
    expect(Math.abs((box!.y + box!.height / 2) - 400)).toBeLessThanOrEqual(2);
    await dialog.getByRole("button", { name: "Close playbook" }).click();
    await expect(page).toHaveURL("/playbooks");
    await expect(dialog).toHaveCount(0);
  });

  test("shows command relationships and remains usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto("/playbooks/commands/verify");

    await expect(page).toHaveTitle("Command | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-dialog").getByRole("heading", { name: "/verify <arguments>" })).toBeVisible();
    await expect(page.getByRole("link", { name: "human-verification-steps" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
