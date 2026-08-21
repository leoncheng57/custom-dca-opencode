import { expect, test } from "@playwright/test";

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;

test.describe.serial("share and export", () => {
  test.beforeEach(async () => {
    await fetch(`${MOCK_URL}/test/sharing/reset`, { method: "POST" });
  });

  test("runs the full modal operations without exporting tools or signatures and restores focus", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(conversation);
    const trigger = page.getByTestId("opencode-share-export-open");
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByTestId("opencode-share-export-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("opencode-share-target")).toHaveText("Full session");
    await expect(dialog.getByTestId("opencode-export-security")).toContainText("provider metadata and signatures");
    await expect(dialog.getByTestId("opencode-export-native-share")).toHaveCount(0);

    await dialog.getByTestId("opencode-export-copy").click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("Add a health endpoint to the server.");
    expect(copied).toContain("I'll add the route now.");
    expect(copied).toContain("### Tool");
    expect(copied).not.toMatch(/export const app|OPAQUE_SIGNATURE|ENCRYPTED_ONLY|npm test|partial output|context excerpt/);

    const download = page.waitForEvent("download");
    await dialog.getByTestId("opencode-export-download").click();
    expect((await download).suggestedFilename()).toBe("Add-a-health-endpoint.md");
    const jsonDownload = page.waitForEvent("download");
    await dialog.getByTestId("opencode-export-download-json").click();
    expect((await jsonDownload).suggestedFilename()).toBe("Add-a-health-endpoint.json");

    await dialog.getByTestId("opencode-share-create").click();
    await expect(dialog.getByTestId("opencode-share-confirmation")).toContainText("full raw session");
    await dialog.getByTestId("opencode-share-confirm").click();
    await expect(dialog.getByTestId("opencode-share-url")).toHaveAttribute("href", "https://share.e2e.example.test/s/ses_mock_done");
    await dialog.getByTestId("opencode-share-export-close").click();
    await page.reload();
    await trigger.click();
    await expect(page.getByTestId("opencode-share-url")).toHaveAttribute("href", "https://share.e2e.example.test/s/ses_mock_done");
    const reopenedDialog = page.getByTestId("opencode-share-export-dialog");
    await reopenedDialog.getByTestId("opencode-share-revoke").click();
    await expect(reopenedDialog.getByTestId("opencode-share-confirmation")).toContainText("revoking");
    await reopenedDialog.getByTestId("opencode-share-confirm").click();
    await expect(reopenedDialog.getByTestId("opencode-share-create")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(reopenedDialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("limits a transcript-row action to one user or assistant message", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(conversation);
    const rowExport = page.getByTestId("opencode-agent-share").first();
    await rowExport.focus();
    await rowExport.press("Enter");
    const dialog = page.getByTestId("opencode-share-export-dialog");
    await expect(dialog.getByTestId("opencode-share-target")).toHaveText("Assistant message");
    await expect(dialog.getByText("Public OpenCode link")).toHaveCount(0);
    await dialog.getByTestId("opencode-export-copy").click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("I'll add the route now.");
    expect(copied).not.toContain("Add a health endpoint to the server.");
    expect(copied).not.toMatch(/export const app|OPAQUE_SIGNATURE/);
  });

  test("uses native share only when the browser exposes it", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => { (globalThis as typeof globalThis & { sharedData?: ShareData }).sharedData = data; },
      });
    });
    await page.goto(conversation);
    await page.getByTestId("opencode-share-export-open").click();
    await page.getByTestId("opencode-export-native-share").click();
    const shared = await page.evaluate(() => (globalThis as typeof globalThis & { sharedData?: ShareData }).sharedData);
    expect(shared?.text).toContain("Add a health endpoint to the server.");
    expect(shared?.text).not.toMatch(/OPAQUE_SIGNATURE|export const app/);
  });

  test("keeps a failed public-share operation visible and retryable", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/sessions/ses_mock_done/share?**", async (route) => {
      if (route.request().method() === "POST" && attempts++ === 0) {
        await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "temporary share failure" }) });
        return;
      }
      await route.continue();
    });
    await page.goto(conversation);
    await page.getByTestId("opencode-share-export-open").click();
    await page.getByTestId("opencode-share-create").click();
    const confirm = page.getByTestId("opencode-share-confirm");
    await confirm.click();
    await expect(page.getByTestId("opencode-share-export-status")).toContainText("temporary share failure");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByTestId("opencode-share-url")).toBeVisible();
  });

  test("contains the modal and controls at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(conversation);
    await page.getByTestId("opencode-mobile-session-menu").locator("summary").click();
    await page.getByTestId("opencode-mobile-share-export-open").click();
    const dialog = page.getByTestId("opencode-share-export-dialog");
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect((await dialog.boundingBox())?.width).toBeLessThanOrEqual(382);
    await expect(dialog.getByTestId("opencode-share-export-close")).toBeVisible();
  });
});
