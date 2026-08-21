import { expect, test } from "@playwright/test";

const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";

test.describe("appearance", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("appearance-test-ready")) return;
      localStorage.removeItem("theme");
      sessionStorage.setItem("appearance-test-ready", "true");
    });
  });

  test("defaults to System and follows resolved device appearance", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings");

    await expect(page.getByTestId("opencode-appearance-system")).toBeChecked();
    await expect(page.getByTestId("opencode-appearance-status")).toHaveText("Selected: System (Dark)");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#16181d");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.getByTestId("opencode-appearance-status")).toHaveText("Selected: System (Light)");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#16a34a");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
  });

  test("preserves explicit choices across reloads and can return to System", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");

    await page.getByTestId("opencode-appearance-dark").locator("..").click();
    await expect(page.getByTestId("opencode-appearance-dark")).toBeChecked();
    await expect(page.getByTestId("opencode-appearance-status")).toHaveText("Selected: Dark");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

    await page.reload();
    await expect(page.getByTestId("opencode-appearance-dark")).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByTestId("opencode-appearance-system").locator("..").click();
    await expect(page.getByTestId("opencode-appearance-status")).toHaveText("Selected: System (Light)");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
  });

  test("offers explicit System, Light, and Dark palette actions", async ({ page }) => {
    await page.goto("/settings");

    for (const appearance of ["dark", "light", "system"] as const) {
      await page.keyboard.press(shortcut);
      await page.getByTestId("opencode-palette-input").fill(`${appearance} appearance`);
      const action = page.getByRole("option", {
        name: new RegExp(`Use ${appearance} appearance`, "i"),
      });
      await expect(action).toBeVisible();
      await action.click();
      expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(appearance);
    }
  });
});
