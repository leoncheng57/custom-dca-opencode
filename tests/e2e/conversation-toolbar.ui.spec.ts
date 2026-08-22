import { expect, test, type Locator, type Page } from "@playwright/test";

// Issue #72, Part A: the conversation header wasted space. The session title
// shared one row with the back link, badges, cost, context tokens and five
// buttons, and a full-width "Auto permissions" banner claimed a whole row of
// its own underneath.
//
// The contract this file locks in:
//   1. the title owns a row above the toolbar, at both widths;
//   2. one compact toolbar holds the actions AND the auto-permissions control;
//   3. turning auto permissions on still reads as dangerous, still offers the
//      Details disclosure and still renders the full warning text;
//   4. nothing touch-reachable at phone width drops below a 44px hit area.

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;

const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 740 } as const;

/** The BFF keeps auto permissions in memory per directory; reset it so a
 *  neighbouring spec cannot leave this one starting from ON. */
async function resetAutoPermissions(page: Page): Promise<void> {
  await page.request.patch(`/api/auto-approve?directory=${encodeURIComponent(DIR)}`, {
    data: { enabled: false },
  });
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, "element should have a layout box").not.toBeNull();
  return rect!;
}

test.describe("conversation header layout", () => {
  for (const [label, viewport, hasTouch] of [
    ["desktop", DESKTOP, false],
    ["mobile", MOBILE, true],
  ] as const) {
    test.describe(`${label}`, () => {
      test.use({ viewport, hasTouch });

      test("gives the session title its own row above the compact toolbar", async ({ page }) => {
        await resetAutoPermissions(page);
        await page.goto(conversation);

        const title = page.getByTestId("opencode-session-title");
        const toolbar = page.getByTestId("opencode-conversation-toolbar");
        await expect(title).toBeVisible();
        await expect(toolbar).toBeVisible();

        const [titleBox, toolbarBox] = await Promise.all([box(title), box(toolbar)]);

        // The toolbar starts at or below the bottom of the title: they are
        // stacked rows, not competing for one line.
        expect(
          toolbarBox.y,
          "the toolbar must sit below the title row, not beside it",
        ).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);

        // "Own row with the full available width" — the title reaches at least
        // to the toolbar's right edge, so no action button crowds it.
        expect(
          titleBox.x + titleBox.width,
          "the title should extend across the row, not stop short of the actions",
        ).toBeGreaterThanOrEqual(toolbarBox.x + toolbarBox.width - 1);

        // Nothing may push the page sideways at either width.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });

      test("puts the auto-permissions control inside the toolbar rather than on its own row", async ({ page }) => {
        await resetAutoPermissions(page);
        await page.goto(conversation);

        const toolbar = page.getByTestId("opencode-conversation-toolbar");
        const control = toolbar.getByTestId("opencode-conversation-auto-permissions");
        await expect(control).toContainText("Auto permissions: OFF");

        const [toolbarBox, controlBox] = await Promise.all([box(toolbar), box(control)]);
        // Inline, not a full-width banner: the chip is a fraction of the row.
        expect(controlBox.width).toBeLessThan(toolbarBox.width);
        expect(controlBox.height).toBeLessThanOrEqual(56);

        // The toolbar is the only home for these actions at this width.
        const actions = label === "desktop"
          ? ["opencode-wrap-toggle", "opencode-share-export-open", "opencode-workspace-open"]
          : ["opencode-mobile-session-menu"];
        for (const id of actions) {
          await expect(toolbar.getByTestId(id)).toBeVisible();
        }
      });

      test("keeps auto permissions unmistakably dangerous when it is on", async ({ page }) => {
        await resetAutoPermissions(page);
        await page.goto(conversation);

        const control = page.getByTestId("opencode-conversation-auto-permissions");
        const toggle = control.getByTestId("opencode-conversation-auto-permissions-toggle");
        await expect(toggle).toHaveAttribute("role", "switch");
        await expect(toggle).toHaveAttribute("aria-checked", "false");
        await expect(toggle).toHaveAccessibleName("Turn auto permissions on");

        const quiet = await control.evaluate((element) => getComputedStyle(element.firstElementChild!).color);

        await toggle.click();
        await expect(control).toContainText("Auto permissions: ON");
        await expect(toggle).toHaveAttribute("aria-checked", "true");
        await expect(toggle).toHaveAccessibleName("Turn auto permissions off");

        // Danger treatment, not a quiet neutral chip: the colour must change.
        const danger = await control.evaluate((element) => getComputedStyle(element.firstElementChild!).color);
        expect(danger).not.toBe(quiet);

        // The disclosure and the full warning survive the compaction and stay
        // in the accessibility tree.
        const details = control.getByTestId("opencode-conversation-auto-permissions-details");
        await expect(details).toBeVisible();
        await expect(control.getByTestId("opencode-conversation-auto-permissions-warning")).toHaveCount(0);
        await details.click();
        const warning = control.getByTestId("opencode-conversation-auto-permissions-warning");
        await expect(warning).toBeVisible();
        await expect(warning).toContainText("arbitrary shell commands");
        await expect(warning).toContainText("every session using this project directory");

        await toggle.click();
        await expect(control).toContainText("Auto permissions: OFF");
        await resetAutoPermissions(page);
      });
    });
  }

  test.describe("mobile touch targets", () => {
    test.use({ viewport: MOBILE, hasTouch: true });

    test("keeps every header control at a 44px hit area", async ({ page }) => {
      await resetAutoPermissions(page);
      await page.goto(conversation);

      const control = page.getByTestId("opencode-conversation-auto-permissions");
      const toggle = control.getByTestId("opencode-conversation-auto-permissions-toggle");
      const menu = page.getByTestId("opencode-mobile-session-menu").locator("summary");

      for (const [name, locator] of [
        ["auto-permissions toggle", toggle],
        ["session actions menu", menu],
      ] as const) {
        const rect = await box(locator);
        expect(rect.height, `${name} must keep a 44px touch target`).toBeGreaterThanOrEqual(44);
      }

      // The Details disclosure only exists while auto permissions is on.
      await toggle.click();
      await expect(control).toContainText("Auto permissions: ON");
      const detailsRect = await box(control.getByTestId("opencode-conversation-auto-permissions-details"));
      expect(detailsRect.height, "Details must keep a 44px touch target").toBeGreaterThanOrEqual(44);
      await toggle.click();
      await expect(control).toContainText("Auto permissions: OFF");

      // The overflow menu items keep the targets they already had.
      await menu.click();
      for (const id of [
        "opencode-mobile-wrap-toggle",
        "opencode-mobile-share-export-open",
        "opencode-mobile-workspace-open",
        "opencode-mobile-inspector-menu-open",
      ]) {
        const rect = await box(page.getByTestId(id));
        expect(rect.height, `${id} must keep a 44px touch target`).toBeGreaterThanOrEqual(44);
      }
      await resetAutoPermissions(page);
    });
  });

  test.describe("desktop compactness", () => {
    test.use({ viewport: DESKTOP, hasTouch: false });

    test("shrinks the action buttons and keeps the readouts in the toolbar", async ({ page }) => {
      await resetAutoPermissions(page);
      await page.goto(conversation);

      const toolbar = page.getByTestId("opencode-conversation-toolbar");
      for (const id of ["opencode-wrap-toggle", "opencode-share-export-open", "opencode-workspace-open"]) {
        const rect = await box(toolbar.getByTestId(id));
        expect(rect.height, `${id} should read as a compact toolbar button`).toBeLessThanOrEqual(32);
      }

      // Cost and context tokens moved out of the title row into the toolbar.
      await expect(toolbar.getByTestId("opencode-context-tokens")).toContainText("context");
      await expect(page.getByTestId("opencode-session-title")).toBeVisible();
    });
  });
});
