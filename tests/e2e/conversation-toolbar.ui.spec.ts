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

// Auto permissions is per-directory in-memory BFF state and this file toggles
// it, so it owns a directory no other spec touches. Playwright runs spec files
// in parallel against a single BFF: sharing /tmp/mock-project with the UI and
// API specs that also toggle the flag made all three flip it under each other,
// which passed in isolation and failed intermittently in a full run.
const TOOLBAR_DIR = process.platform === "darwin"
  ? "/private/tmp/mock-toolbar-project"
  : "/tmp/mock-toolbar-project";
const conversation = `/sessions/ses_mock_toolbar?directory=${encodeURIComponent(TOOLBAR_DIR)}`;

const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 740 } as const;

/** The BFF keeps auto permissions in memory per directory, and this file's
 *  tests turn it on. Reset between them so an earlier test cannot leave a
 *  later one starting from ON — TOOLBAR_DIR keeps that entirely in this file. */
async function resetAutoPermissions(page: Page): Promise<void> {
  await page.request.patch(`/api/auto-approve?directory=${encodeURIComponent(TOOLBAR_DIR)}`, {
    data: { enabled: false },
  });
}

/**
 * `client/styles.css` floors every `button` at 44px under `(pointer: coarse)`,
 * and that unlayered rule outranks Tailwind's layered utilities. It is a good
 * net, but it also hides the difference between a component that earns its own
 * hit area and one that only inherits it — a breakpoint-keyed control renders
 * at 44px on a touch tablet purely because of this rule. Dropping the rule from
 * the CSSOM is what makes the component's own sizing observable.
 */
async function dropGlobalCoarsePointerFloor(page: Page): Promise<number> {
  return page.evaluate(() => {
    let removed = 0;
    const targetsBareButton = (rule: CSSMediaRule) =>
      Array.from(rule.cssRules).some(
        (inner) =>
          inner instanceof CSSStyleRule &&
          inner.selectorText.split(",").some((selector) => selector.trim() === "button"),
      );
    const scan = (group: CSSGroupingRule | CSSStyleSheet) => {
      const rules = group.cssRules;
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (rule instanceof CSSMediaRule && /pointer\s*:\s*coarse/.test(rule.conditionText) && targetsBareButton(rule)) {
          group.deleteRule(index);
          removed += 1;
          continue;
        }
        if ("cssRules" in rule) scan(rule as CSSGroupingRule);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        void sheet.cssRules;
      } catch {
        continue;
      }
      scan(sheet);
    }
    return removed;
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
        await expect(control).toContainText("Auto");

        const [toolbarBox, controlBox] = await Promise.all([box(toolbar), box(control)]);
        // Inline, not a full-width banner: the chip is a fraction of the row.
        expect(controlBox.width).toBeLessThan(toolbarBox.width);
        expect(controlBox.height).toBeLessThanOrEqual(56);

        // Desktop keeps its compact controls; phones surface their primary
        // session actions immediately below the title.
        const actions = label === "desktop"
          ? ["opencode-wrap-toggle", "opencode-share-export-open", "opencode-workspace-open"]
          : ["opencode-mobile-workspace-open", "opencode-mobile-mrs-open", "opencode-mobile-runlog-open"];
        for (const id of actions) {
          await expect(page.getByTestId(id)).toBeVisible();
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

      for (const id of [
        "opencode-mobile-wrap-toggle",
        "opencode-mobile-share-export-open",
        "opencode-mobile-workspace-open",
        "opencode-mobile-mrs-open",
        "opencode-mobile-runlog-open",
      ]) {
        if (id.startsWith("opencode-mobile-wrap") || id.startsWith("opencode-mobile-share")) await menu.click();
        const rect = await box(page.getByTestId(id));
        expect(rect.height, `${id} must keep a 44px touch target`).toBeGreaterThanOrEqual(44);
        if (id.startsWith("opencode-mobile-wrap") || id.startsWith("opencode-mobile-share")) await menu.click();
      }
      await expect(page.getByTestId("opencode-mobile-mrs-open")).toBeDisabled();
      await expect(page.getByTestId("opencode-mobile-mrs-open")).toHaveAccessibleName("Merge requests, coming soon");
      await resetAutoPermissions(page);
    });
  });

  // Regression guard for the review of PR #77: the compact variant originally
  // keyed its hit area off the `sm` breakpoint, so a touch tablet at >=640px
  // (iPad portrait is 768px) collapsed the auto-permissions toggle to 28px
  // while the Wrap/Share/Workspace buttons beside it — which key off pointer
  // type — correctly stayed 44px. A breakpoint is not a pointer type.
  test.describe("touch tablet at desktop width", () => {
    test.use({ viewport: DESKTOP, hasTouch: true });

    test("keeps the auto-permissions controls at 44px on a coarse pointer at any width", async ({ page }) => {
      await resetAutoPermissions(page);
      await page.goto(conversation);

      const control = page.getByTestId("opencode-conversation-auto-permissions");
      const toggle = control.getByTestId("opencode-conversation-auto-permissions-toggle");

      const toggleRect = await box(toggle);
      expect(
        toggleRect.height,
        "the auto-permissions toggle must keep a 44px touch target on a coarse pointer, not only below sm",
      ).toBeGreaterThanOrEqual(44);

      // Sanity: the sibling action buttons in the same row already do this, so
      // the two mechanisms must agree rather than disagree by 16px.
      const wrapRect = await box(page.getByTestId("opencode-wrap-toggle"));
      expect(wrapRect.height, "action buttons already honour the coarse pointer").toBeGreaterThanOrEqual(44);

      await toggle.click();
      await expect(control).toContainText("Auto permissions: ON");
      const detailsRect = await box(control.getByTestId("opencode-conversation-auto-permissions-details"));
      expect(
        detailsRect.height,
        "Details must keep a 44px touch target on a coarse pointer, not only below sm",
      ).toBeGreaterThanOrEqual(44);

      await toggle.click();
      await expect(control).toContainText("Auto permissions: OFF");
      await resetAutoPermissions(page);
    });

    // The assertion above cannot fail while styles.css floors every button at
    // 44px on a coarse pointer, so it does not actually prove the control earns
    // its own hit area. This one does: with the global net removed, a
    // breakpoint-keyed control collapses to 28px at this width and a
    // pointer-keyed one does not.
    test("earns its 44px hit area without leaning on the global coarse-pointer floor", async ({ page }) => {
      await resetAutoPermissions(page);
      await page.goto(conversation);

      const control = page.getByTestId("opencode-conversation-auto-permissions");
      const toggle = control.getByTestId("opencode-conversation-auto-permissions-toggle");
      await expect(toggle).toBeVisible();

      const removed = await dropGlobalCoarsePointerFloor(page);
      expect(removed, "the global coarse-pointer floor in styles.css should have been found").toBeGreaterThan(0);

      expect(
        (await box(toggle)).height,
        "the toggle must size itself on pointer type, not on the sm breakpoint",
      ).toBeGreaterThanOrEqual(44);

      await toggle.click();
      await expect(control).toContainText("Auto permissions: ON");
      expect(
        (await box(control.getByTestId("opencode-conversation-auto-permissions-details"))).height,
        "Details must size itself on pointer type, not on the sm breakpoint",
      ).toBeGreaterThanOrEqual(44);

      await toggle.click();
      await expect(control).toContainText("Auto permissions: OFF");
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
