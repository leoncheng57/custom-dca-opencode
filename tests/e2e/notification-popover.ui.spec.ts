import { expect, test, type Page } from "@playwright/test";

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const hub = `/?directory=${encodeURIComponent(DIR)}`;
const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";

const VIEWPORTS = [
  { name: "desktop", size: { width: 1280, height: 800 } },
  { name: "mobile", size: { width: 390, height: 740 } },
] as const;

const ACTIVE_COUNT = 8;
const RESOLVED_COUNT = 6;

interface StubRecord {
  id: string;
  kind: string;
  at: number;
  directory: string;
  sessionID: string;
  title: string;
  body: string;
  resolvedAt?: number;
  resolvedBy?: string;
  delivery: { ntfy: "off"; desktop: "off" };
}

function seedRecords(): StubRecord[] {
  const base = Date.UTC(2026, 7, 22, 12, 0, 0);
  const records: StubRecord[] = [];
  for (let index = 0; index < ACTIVE_COUNT; index += 1) {
    records.push({
      id: `ntf_active_${index}`,
      kind: "permission",
      at: base - index * 60_000,
      directory: DIR,
      sessionID: "ses_mock_done",
      title: `OpenCode needs permission ${index}`,
      body: `bash: npm run seeded-${index}`,
      delivery: { ntfy: "off", desktop: "off" },
    });
  }
  for (let index = 0; index < RESOLVED_COUNT; index += 1) {
    records.push({
      id: `ntf_resolved_${index}`,
      kind: "idle",
      at: base - (ACTIVE_COUNT + index) * 60_000,
      directory: DIR,
      sessionID: "ses_mock_done",
      title: `Session finished ${index}`,
      body: `seeded resolved ${index}`,
      resolvedAt: base,
      resolvedBy: "checked",
      delivery: { ntfy: "off", desktop: "off" },
    });
  }
  return records;
}

/**
 * The notification history file is shared by every e2e worker, so this suite
 * serves a deterministic history from a route stub instead of seeding real
 * notifications. That keeps the popover assertions exact and keeps this spec
 * from perturbing the counts other specs measure. The real BFF resolution path
 * stays covered by the badge test in smoke.ui.spec.ts.
 */
async function stubHistory(page: Page) {
  const state = { records: seedRecords() };
  await page.route("**/api/notifications/history*", async (route) => {
    await route.fulfill({
      json: {
        records: state.records,
        activeCount: state.records.filter((record) => record.resolvedAt === undefined).length,
      },
    });
  });
  await page.route(/\/api\/notifications\/ntf_[^/]+$/, async (route) => {
    const { resolved } = route.request().postDataJSON() as { resolved: boolean };
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const record = state.records.find((candidate) => candidate.id === id);
    if (!record) return route.fulfill({ status: 404, json: { error: "unknown record" } });
    if (resolved) {
      record.resolvedAt = Date.UTC(2026, 7, 22, 13, 0, 0);
      record.resolvedBy = "checked";
    } else {
      delete record.resolvedAt;
      delete record.resolvedBy;
    }
    await route.fulfill({
      json: {
        record,
        activeCount: state.records.filter((candidate) => candidate.resolvedAt === undefined).length,
      },
    });
  });
}

const bell = (page: Page) => page.getByTestId("opencode-nav-notifications");
const popover = (page: Page) => page.getByTestId("opencode-notification-popover");

for (const viewport of VIEWPORTS) {
  test.describe(`nav notification centre (${viewport.name})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await stubHistory(page);
    });

    test("shows the DCA brand, search and a badged bell", async ({ page }) => {
      await page.goto(hub);
      await expect(page.getByTestId("opencode-nav-home")).toHaveText("DCA");

      const search = page.getByTestId("opencode-palette-open");
      await expect(search).toBeVisible();
      await expect(search).toHaveAttribute("aria-label", "Search commands");
      await expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K");
      await expect(search).toHaveAttribute("title", "Search commands (Cmd/Ctrl+K)");
      await search.click();
      await expect(page.getByTestId("opencode-command-palette")).toBeVisible();
      await page.getByTestId("opencode-palette-input").press("Escape");

      await page.keyboard.press(shortcut);
      await expect(page.getByTestId("opencode-command-palette")).toBeVisible();
      await page.getByTestId("opencode-palette-input").press("Escape");

      await expect(bell(page)).toBeVisible();
      await expect(bell(page)).toHaveAttribute("aria-haspopup", "dialog");
      await expect(bell(page)).toHaveAttribute("aria-expanded", "false");
      await expect(bell(page)).toHaveAttribute("aria-label", `Notifications, ${ACTIVE_COUNT} unresolved`);
      await expect(page.getByTestId("opencode-nav-notifications-badge")).toHaveText(String(ACTIVE_COUNT));
      await expect(page.getByTestId("opencode-nav-notifications-badge")).toHaveAttribute("aria-hidden", "true");
    });

    test("opens an accessible popover without navigating", async ({ page }) => {
      await page.goto(hub);
      const before = page.url();
      await bell(page).click();

      const panel = page.getByRole("dialog", { name: "Notifications" });
      await expect(panel).toBeVisible();
      await expect(bell(page)).toHaveAttribute("aria-expanded", "true");
      expect(page.url()).toBe(before);

      // Active and Resolved stay in their own sections.
      await expect(page.getByTestId("opencode-notification-popover-active-count")).toHaveText(String(ACTIVE_COUNT));
      await expect(page.getByTestId("opencode-notification-popover-resolved-count")).toHaveText(String(RESOLVED_COUNT));
      await expect(popover(page).getByRole("heading", { name: "Active" })).toBeVisible();
      await expect(popover(page).getByRole("heading", { name: "Resolved" })).toBeVisible();

      // Both lists are bounded and scroll on their own.
      for (const testId of ["opencode-notification-popover-active", "opencode-notification-popover-resolved"]) {
        const metrics = await page.getByTestId(testId).evaluate((node) => ({
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        }));
        expect(metrics.clientHeight, `${testId} is bounded`).toBeLessThanOrEqual(240);
        expect(metrics.scrollHeight, `${testId} scrolls`).toBeGreaterThan(metrics.clientHeight);
      }

      await expect(page.getByTestId("opencode-notification-popover-history")).toHaveAttribute(
        "href",
        `/settings/notifications?directory=${encodeURIComponent(DIR)}`,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
    });

    test("closes on Escape with focus restored, and on an outside click", async ({ page }) => {
      await page.goto(hub);
      await bell(page).click();
      await expect(popover(page)).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(popover(page)).toHaveCount(0);
      await expect(bell(page)).toBeFocused();
      await expect(bell(page)).toHaveAttribute("aria-expanded", "false");

      await bell(page).click();
      await expect(popover(page)).toBeVisible();
      // The nav's own padding is outside the popover and navigates nowhere.
      await page.mouse.click(5, 5);
      await expect(popover(page)).toHaveCount(0);
    });

    test("resolves a record in place and decrements the badge", async ({ page }) => {
      await page.goto(hub);
      await bell(page).click();

      const activeList = page.getByTestId("opencode-notification-popover-active");
      const row = activeList.getByTestId("opencode-notification-record").first();
      await expect(row).toHaveAttribute("data-active", "true");
      await expect(row).toContainText("OpenCode needs permission 0");
      // click(), not check(): resolving moves the row into the Resolved column,
      // so check()'s post-click verification would re-resolve to the next
      // unresolved row and click forever.
      await row.getByTestId("opencode-notification-resolved").click();

      await expect(page.getByTestId("opencode-nav-notifications-badge")).toHaveText(String(ACTIVE_COUNT - 1));
      await expect(page.getByTestId("opencode-notification-popover-active-count")).toHaveText(String(ACTIVE_COUNT - 1));
      await expect(page.getByTestId("opencode-notification-popover-resolved-count")).toHaveText(String(RESOLVED_COUNT + 1));
      await expect(bell(page)).toHaveAttribute("aria-label", `Notifications, ${ACTIVE_COUNT - 1} unresolved`);

      // Reversible: unchecking it in the Resolved column puts the count back.
      const resolvedList = page.getByTestId("opencode-notification-popover-resolved");
      const resolvedRow = resolvedList.getByTestId("opencode-notification-record").first();
      await expect(resolvedRow).toContainText("OpenCode needs permission 0");
      await expect(resolvedRow.getByTestId("opencode-notification-resolved")).toBeChecked();
      await resolvedRow.getByTestId("opencode-notification-resolved").click();
      await expect(page.getByTestId("opencode-nav-notifications-badge")).toHaveText(String(ACTIVE_COUNT));
      await expect(page.getByTestId("opencode-notification-popover-active-count")).toHaveText(String(ACTIVE_COUNT));
    });

    test("keeps Phone, Docs, Tools and Settings reachable from More", async ({ page }) => {
      await page.goto(hub);
      const more = page.getByTestId("opencode-nav-more");
      await expect(more).toHaveAttribute("aria-haspopup", "menu");
      await more.click();
      await expect(page.getByTestId("opencode-nav-more-menu")).toBeVisible();
      for (const testId of ["opencode-phone-transfer-open", "opencode-nav-docs", "opencode-nav-tools", "opencode-nav-settings"]) {
        await expect(page.getByTestId(testId)).toBeVisible();
      }

      // Keyboard reachable: arrow keys move through the menu items.
      await expect(page.getByTestId("opencode-phone-transfer-open")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByTestId("opencode-nav-docs")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("opencode-nav-more-menu")).toHaveCount(0);
      await expect(more).toBeFocused();

      await more.click();
      await page.getByTestId("opencode-nav-tools").click();
      await expect(page).toHaveURL(new RegExp(`/tools\\?directory=${encodeURIComponent(DIR)}`));
    });

    test("still lists the moved destinations in the command palette", async ({ page }) => {
      await page.goto(hub);
      await page.keyboard.press(shortcut);
      for (const name of [/Docs/, /Tools/, /Settings/, /Notifications/, /Open on phone/]) {
        await expect(page.getByRole("option", { name }).first()).toBeVisible();
      }
    });

    test("keeps history at /settings/notifications and preferences at /settings", async ({ page }) => {
      await page.goto(`/settings/notifications?directory=${encodeURIComponent(DIR)}`);
      await expect(page.getByTestId("opencode-notifications")).toBeVisible();
      await expect(page.getByTestId("opencode-notification-history")).toBeVisible();
      await expect(page.getByTestId("opencode-notifications-active-count")).toHaveText(String(ACTIVE_COUNT));
      await expect(page.getByTestId("opencode-notification-record").first()).toBeVisible();
      await page.getByTestId("opencode-history-filter-resolved").click();
      await expect(page.getByTestId("opencode-notification-record")).toHaveCount(RESOLVED_COUNT);
      await page.getByTestId("opencode-history-filter-active").click();
      await expect(page.getByTestId("opencode-notification-record")).toHaveCount(ACTIVE_COUNT);
      // Preferences are no longer here.
      await expect(page.getByTestId("opencode-notification-media")).toHaveCount(0);
      await expect(page.getByTestId("opencode-notifications-save")).toHaveCount(0);

      await page.goto(`/settings?directory=${encodeURIComponent(DIR)}`);
      await expect(page.getByTestId("opencode-notification-preferences")).toBeVisible();
      for (const testId of [
        "opencode-ntfy-enabled",
        "opencode-ntfy-server",
        "opencode-ntfy-topic",
        "opencode-browser-desktop",
        "opencode-notification-capability",
        "opencode-parked-seconds",
        "opencode-notification-media",
        "opencode-browser-sound",
        "opencode-notify-browser-idle",
        "opencode-notify-ntfy-idle",
        "opencode-notifications-save",
        "opencode-notifications-test-browser",
        "opencode-notifications-test-ntfy",
      ]) {
        await expect(page.getByTestId(testId)).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
    });
  });
}
