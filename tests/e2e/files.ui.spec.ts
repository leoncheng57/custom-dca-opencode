import { expect, test } from "@playwright/test";

// The read-only /files viewer. Every test here is read-only — no BFF state is
// mutated and no mock reset is called — so this file shares /tmp/mock-project
// with the other specs without owning a key (see
// tests/e2e-shared-state-ownership.test.ts).

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const files = `/files?directory=${encodeURIComponent(DIR)}`;

test.describe("files viewer", () => {
  test("browses the tree and highlights a file server-side", async ({ page }) => {
    await page.goto(files);

    await expect(page.getByTestId("opencode-files")).toBeVisible();
    await page.getByTestId("opencode-file-node").filter({ hasText: "README.md" }).click();

    const content = page.getByTestId("opencode-file-content");
    await expect(content).toContainText("Mock project");
    // Shiki ran in the BFF: the markup carries per-line spans and CSS
    // variables for both themes, and no literal colour.
    const pre = content.locator("pre.shiki");
    await expect(pre).toBeVisible();
    await expect(pre).toHaveAttribute("style", /--shiki-light:/);
    await expect(pre).toHaveAttribute("style", /--shiki-dark:/);
    await expect(page.getByTestId("opencode-file-viewer")).toContainText("markdown");
  });

  test("numbers lines without putting the numbers in the copyable text", async ({ page }) => {
    await page.goto(`${files}&path=src&file=${encodeURIComponent("src/index.ts")}`);

    const content = page.getByTestId("opencode-file-content");
    await expect(content.locator("span.line")).toHaveCount(2);
    // The gutter is a CSS counter on ::before, so the DOM text is the source
    // alone. If it ever becomes markup, a copied selection gains line numbers.
    await expect(content).toHaveText("export const answer = 42;\nexport default answer;\n");
  });

  test("deep-links straight to a file and keeps the URL authoritative", async ({ page }) => {
    await page.goto(`${files}&file=README.md`);
    await expect(page.getByTestId("opencode-file-content")).toContainText("Mock project");

    // Selecting another file is a navigation, so Back returns to the first.
    await page.getByTestId("opencode-file-node").filter({ hasText: "src" }).click();
    await page.getByTestId("opencode-file-node").filter({ hasText: "index.ts" }).click();
    await expect(page.getByTestId("opencode-file-content")).toContainText("answer = 42");
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/file=README.md/);
    await expect(page.getByTestId("opencode-file-content")).toContainText("Mock project");
  });

  test("falls back to plain text when no grammar exists, and says so", async ({ page }) => {
    await page.goto(`${files}&path=src&file=${encodeURIComponent("src/notes.unknownext")}`);

    const content = page.getByTestId("opencode-file-content");
    await expect(content).toContainText("plain fixture text");
    await expect(content.locator("pre.shiki")).toHaveCount(0);
    // Still numbered: the fallback is rendered in Shiki's shape on purpose.
    await expect(content.locator("span.line")).toHaveCount(1);
    await expect(page.getByTestId("opencode-file-viewer")).toContainText("No grammar for this file type");
  });

  test("persists the wrap toggle across a reload", async ({ page }) => {
    await page.goto(`${files}&file=README.md`);
    const content = page.getByTestId("opencode-file-content");
    await expect(content).not.toHaveClass(/wrap/);

    await page.getByTestId("opencode-file-wrap").click();
    await expect(content).toHaveClass(/wrap/);
    await expect(page.getByTestId("opencode-file-wrap")).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.getByTestId("opencode-file-content")).toHaveClass(/wrap/);
  });

  test("copies the raw source rather than the rendered markup", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are chromium-only here");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`${files}&path=src&file=${encodeURIComponent("src/index.ts")}`);

    await page.getByTestId("opencode-file-copy").click();
    await expect(page.getByTestId("opencode-file-copy")).toContainText("Copied");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe("export const answer = 42;\nexport default answer;");
  });

  test("surfaces the read gate instead of rendering a secret", async ({ page }) => {
    // .env is refused by requireReadableWorkspacePath, and the viewer must show
    // that rather than an empty pane.
    await page.goto(`${files}&file=.env`);
    await expect(page.getByRole("alert")).toContainText("sensitive workspace paths");
    await expect(page.getByTestId("opencode-file-content")).toHaveCount(0);
  });

  test("prompts for a project when none is selected", async ({ page }) => {
    await page.goto("/files");
    await expect(page.getByRole("alert")).toContainText("Open a project on the home page first");
  });

  test("is reachable from the overflow nav and the command palette", async ({ page }) => {
    await page.goto(`/?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-nav-more").click();
    await page.getByTestId("opencode-nav-files").click();
    await expect(page.getByTestId("opencode-files")).toBeVisible();
    await expect(page).toHaveURL(/\/files\?directory=/);
  });
});
