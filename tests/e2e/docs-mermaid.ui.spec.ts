import { expect, test } from "@playwright/test";

test.describe("documentation Mermaid diagrams", () => {
  test("renders the architecture diagram and preserves ordinary code blocks", async ({ page }) => {
    await page.goto("/docs/architecture");

    const diagram = page.getByTestId("opencode-mermaid-diagram");
    await expect(diagram).toHaveCount(1);
    await expect(diagram.locator("svg[role='img'][aria-label='Mermaid diagram']")).toBeVisible();
    await expect(page.locator("pre > code.language-mermaid")).toHaveCount(0);
    await expect(page.locator("pre > code.language-bash")).toContainText("npm run typecheck");
  });

  test("renders every PR preview diagram in light and dark without widening a phone viewport", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/docs/pr-previews");
    await expect(page.getByTestId("opencode-mermaid-diagram")).toHaveCount(6);
    const light = await page.getByTestId("opencode-mermaid-diagram").first().evaluate((element) => getComputedStyle(element).backgroundColor);

    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await page.getByTestId("opencode-mermaid-diagram").first().evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(dark).not.toBe(light);

    await page.setViewportSize({ width: 390, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator("pre > code.language-text").first()).toBeVisible();
  });

  test("falls back to source when Mermaid cannot load", async ({ page }) => {
    await page.route("**/*mermaid*.js", (route) => route.abort());
    await page.goto("/docs/architecture");

    const fallback = page.getByTestId("opencode-mermaid-fallback");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("flowchart TD");
    await expect(fallback.getByRole("alert")).toContainText("Diagram could not be rendered");
  });
});
