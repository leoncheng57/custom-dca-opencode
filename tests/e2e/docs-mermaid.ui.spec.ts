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
    const diagramColors = await page.getByTestId("opencode-mermaid-diagram").first().evaluate((element) => {
      const svg = element.querySelector("svg")!;
      const node = svg.querySelector(".node path, .node polygon, .node rect")!;
      const label = svg.querySelector(".node .label")!;
      const edge = svg.querySelector(".flowchart-link")!;
      const contrast = (foreground: string, background: string) => {
        const rgb = (color: string) => color.match(/\d+/gu)!.slice(0, 3).map(Number).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        const luminance = (color: string) => {
          const [red, green, blue] = rgb(color);
          return red * 0.2126 + green * 0.7152 + blue * 0.0722;
        };
        const [first, second] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (first + 0.05) / (second + 0.05);
      };
      const nodeFill = getComputedStyle(node).fill;
      const labelFill = getComputedStyle(label).fill;
      const edgeStroke = getComputedStyle(edge).stroke;
      return {
        nodeFill,
        nodeStroke: getComputedStyle(node).stroke,
        labelFill,
        edgeStroke,
        labelContrast: contrast(labelFill, nodeFill),
        edgeContrast: contrast(edgeStroke, getComputedStyle(element).backgroundColor),
        nodeLabels: [...svg.querySelectorAll(".node")].map((node) => node.textContent?.trim()),
        foreignObjects: svg.querySelectorAll("foreignObject").length,
      };
    });
    expect(dark).not.toBe(light);
    // A removed Mermaid <style> sheet regresses to black SVG defaults in dark
    // mode. Verify the real node, label, and edge colors after a theme rerender.
    for (const color of [diagramColors.nodeFill, diagramColors.nodeStroke, diagramColors.labelFill, diagramColors.edgeStroke]) {
      expect(color).not.toBe("rgb(0, 0, 0)");
    }
    expect(diagramColors.labelContrast).toBeGreaterThanOrEqual(4.5);
    expect(diagramColors.edgeContrast).toBeGreaterThanOrEqual(3);
    expect(diagramColors.nodeLabels).toEqual(expect.arrayContaining(["GitHub Pages", "opencode serve"]));
    expect(diagramColors.foreignObjects).toBe(0);

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
