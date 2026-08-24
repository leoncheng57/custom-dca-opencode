import { expect, test, type Locator, type Page } from "@playwright/test";

// This spec owns its directory because auto permissions is in-memory BFF state.
const TOOLBAR_DIR = process.platform === "darwin"
  ? "/private/tmp/mock-toolbar-project"
  : "/tmp/mock-toolbar-project";
const conversation = `/sessions/ses_mock_toolbar?directory=${encodeURIComponent(TOOLBAR_DIR)}`;
const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 740 } as const;

async function resetAutoPermissions(page: Page): Promise<void> {
  await page.request.patch(`/api/auto-approve?directory=${encodeURIComponent(TOOLBAR_DIR)}`, {
    data: { enabled: false },
  });
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, "element should have a layout box").not.toBeNull();
  return rect!;
}

test.describe("mobile conversation action bar", () => {
  test.use({ viewport: MOBILE, hasTouch: true });

  test("uses five icon-only, touch-safe controls without horizontal overflow", async ({ page }) => {
    await resetAutoPermissions(page);
    await page.goto(conversation);

    const actions = page.getByTestId("opencode-mobile-conversation-actions");
    await expect(actions).toBeVisible();
    await expect(actions).not.toContainText("Workspace");
    await expect(actions).not.toContainText("Run log");
    await expect(page.getByTestId("opencode-mobile-mrs-open")).toHaveCount(0);

    const controls = [
      page.getByTestId("opencode-mobile-workspace-open"),
      page.getByTestId("opencode-mobile-reviews-open"),
      page.getByTestId("opencode-mobile-runlog-open"),
      page.getByTestId("opencode-mobile-auto-permissions-toggle"),
      page.getByTestId("opencode-mobile-session-menu").locator(":scope > summary"),
    ];
    for (const control of controls) {
      const rect = await box(control);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.width).toBeGreaterThanOrEqual(44);
      await expect(control).toHaveAttribute("title", /.+/);
    }
    await expect(controls[0]).toHaveAccessibleName("Open workspace");
    await expect(controls[1]).toHaveAccessibleName("Open reviews");
    await expect(controls[2]).toHaveAccessibleName("Open run log");
    await expect(controls[3]).toHaveAttribute("role", "switch");
    await expect(controls[3]).toHaveAttribute("aria-checked", "false");
    await expect(controls[3]).toHaveAccessibleName("Turn auto permissions on");
    await expect(controls[4]).toHaveAccessibleName("More session actions");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("opens workspace and requested inspector tabs directly", async ({ page }) => {
    await resetAutoPermissions(page);
    await page.goto(conversation);

    await page.getByTestId("opencode-mobile-workspace-open").click();
    await expect(page.getByTestId("opencode-workspace-panels")).toBeVisible();
    await page.getByTestId("opencode-workspace-close").click();

    await page.getByTestId("opencode-mobile-reviews-open").click();
    const inspector = page.getByTestId("opencode-mobile-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByTestId("opencode-merge-request-list")).toBeVisible();
    await page.getByTestId("opencode-mobile-inspector-close").click();

    await page.getByTestId("opencode-mobile-runlog-open").click();
    await expect(inspector.getByTestId("opencode-command-list")).toBeVisible();
  });

  test("keeps wrap, share, catalog, and permission safety in More", async ({ page }) => {
    await resetAutoPermissions(page);
    await page.goto(conversation);

    const menu = page.getByTestId("opencode-mobile-session-menu");
    await menu.locator(":scope > summary").click();
    for (const id of ["opencode-mobile-wrap-toggle", "opencode-mobile-share-export-open", "opencode-mobile-catalog-open"]) {
      const item = page.getByTestId(id);
      await expect(item).toBeVisible();
      expect((await box(item)).height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByTestId("opencode-mobile-auto-permissions-safety")).toContainText("arbitrary shell commands");

    await page.getByTestId("opencode-mobile-catalog-open").click();
    await expect(page.getByTestId("opencode-mobile-inspector").getByTestId("opencode-catalog")).toBeVisible();

    await page.getByTestId("opencode-mobile-inspector-close").click();
    await page.getByTestId("opencode-mobile-auto-permissions-toggle").click();
    await expect(page.getByTestId("opencode-mobile-auto-permissions-toggle")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("opencode-mobile-auto-permissions-toggle")).toHaveAccessibleName("Turn auto permissions off");
    await resetAutoPermissions(page);
  });
});

test.describe("desktop conversation toolbar", () => {
  test.use({ viewport: DESKTOP, hasTouch: false });

  test("retains compact desktop actions and the inline auto-permissions control", async ({ page }) => {
    await resetAutoPermissions(page);
    await page.goto(conversation);

    const toolbar = page.getByTestId("opencode-conversation-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(page.getByTestId("opencode-mobile-conversation-actions")).toBeHidden();
    await expect(toolbar.getByTestId("opencode-conversation-auto-permissions")).toContainText("Auto");
    for (const id of ["opencode-wrap-toggle", "opencode-share-export-open", "opencode-workspace-open"]) {
      expect((await box(toolbar.getByTestId(id))).height, `${id} remains compact on desktop`).toBeLessThanOrEqual(32);
    }
  });
});
