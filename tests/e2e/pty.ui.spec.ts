import { expect, test } from "@playwright/test";

// UI tier for the terminal. The API tier already proves the contract; what only
// a browser can prove is that the socket round-trips through a real xterm.js
// canvas, and that the phone layout really is read-only rather than merely
// labelled that way.

// A project of its own: Playwright runs spec files in parallel workers against
// one shared mock, so sharing terminal fixtures with pty.api.spec.ts would let
// its kills race this file's resets.
const DIR = process.platform === "darwin" ? "/private/tmp/mock-pty-project" : "/tmp/mock-pty-project";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;
const terminalUrl = `/terminal?directory=${encodeURIComponent(DIR)}`;

test.beforeEach(async () => {
  await fetch(`${MOCK_URL}/test/ptys/reset?directory=${encodeURIComponent(DIR)}`);
});

test.describe("terminal page", () => {
  test("is reachable from the nav when the server enables it", async ({ page }) => {
    await page.goto(`/?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-nav-more").click();
    const nav = page.getByTestId("opencode-nav-terminal");
    await expect(nav).toBeVisible();
    await nav.click();
    await expect(page.getByTestId("opencode-terminal")).toBeVisible();
    // The badge is the honest statement of what this deployment permits.
    await expect(page.getByTestId("opencode-terminal-mode")).toHaveText("interactive");
  });

  test("lists the project's terminals with their status", async ({ page }) => {
    await page.goto(terminalUrl);
    const rows = page.getByTestId("opencode-terminal-row");
    await expect(rows).toHaveCount(2);
    await expect(page.getByText("running · pid 4242")).toBeVisible();
    await expect(page.getByText("exited (0)")).toBeVisible();
  });

  test("attaches, renders output, and sends keystrokes upstream", async ({ page }) => {
    await page.goto(terminalUrl);
    await page.getByTestId("opencode-terminal-select").first().click();
    const view = page.getByTestId("opencode-terminal-view");
    await expect(view).toBeVisible();

    // The mock greets on connect; seeing it means the whole chain worked:
    // browser -> BFF upgrade -> BFF's own upstream socket -> back again.
    await expect(view).toContainText("mock-pty", { timeout: 10_000 });
    // The upstream control frame (\x00{"cursor":0}) must NOT reach the canvas.
    await expect(view).not.toContainText("cursor");

    await view.click();
    await page.keyboard.type("id");
    // The mock echoes input back prefixed, proving the keystroke left the browser.
    await expect(view).toContainText("echo:", { timeout: 10_000 });
  });

  test("starts a new terminal and selects it", async ({ page }) => {
    await page.goto(terminalUrl);
    await page.getByTestId("opencode-terminal-new").click();
    await expect(page.getByTestId("opencode-terminal-row")).toHaveCount(3);
    await expect(page.getByTestId("opencode-terminal-view")).toBeVisible();
  });

  test("kills a terminal and drops it from the list", async ({ page }) => {
    await page.goto(terminalUrl);
    await page.getByTestId("opencode-terminal-kill").first().click();
    await expect(page.getByTestId("opencode-terminal-row")).toHaveCount(1);
  });

  test("surfaces a missing project instead of an empty screen", async ({ page }) => {
    await page.goto("/terminal");
    await expect(page.getByTestId("opencode-terminal-no-directory")).toBeVisible();
  });
});

test.describe("terminal on a phone", () => {
  test.use({ viewport: { width: 390, height: 740 }, hasTouch: true });

  test("is read-only even though the server permits input", async ({ page }) => {
    // Recorded decision (AGENTS.md #16): a soft keyboard cannot send Ctrl, Tab
    // or arrow keys, so an "interactive" phone terminal is one you can break
    // something in but not work in. Read-only is the honest phone experience.
    await page.goto(terminalUrl);
    await page.getByTestId("opencode-terminal-select").first().click();
    await expect(page.getByTestId("opencode-terminal-readonly-notice")).toContainText("small screens");

    const view = page.getByTestId("opencode-terminal-view");
    await expect(view).toContainText("mock-pty", { timeout: 10_000 });
    await view.click();
    await page.keyboard.type("rm -rf /");
    // Nothing is echoed because nothing was sent.
    await expect(view).not.toContainText("echo:");
  });

  test("offers no launcher, because a shell you cannot type into is pointless", async ({ page }) => {
    await page.goto(terminalUrl);
    await expect(page.getByTestId("opencode-terminal-row").first()).toBeVisible();
    await expect(page.getByTestId("opencode-terminal-new")).toHaveCount(0);
  });

  test("stays inside the viewport", async ({ page }) => {
    await page.goto(terminalUrl);
    // Wait for the settled layout before measuring; the terminal list and the
    // nav's Terminal entry both arrive asynchronously.
    await expect(page.getByTestId("opencode-nav-more")).toBeVisible();
    await expect(page.getByTestId("opencode-terminal-row").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
