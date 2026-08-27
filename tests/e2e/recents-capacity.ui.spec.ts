import { expect, test, type Page } from "@playwright/test";

// Issue #44 — the recents panels used to be capped at five rows in three
// coordinated places (the client view helper, the BFF window and the client's
// request default). They now hold up to a hundred and scroll inside a
// fixed-height section instead of growing the page.
//
// This file owns /tmp/mock-recents-project and its twelve `ses_recents_*`
// fixtures. Nothing else scopes recents to that directory, so the row counts
// asserted here cannot be moved by a spec running in parallel.

const RECENTS_DIR = process.platform === "darwin" ? "/private/tmp/mock-recents-project" : "/tmp/mock-recents-project";
const hub = `/?directory=${encodeURIComponent(RECENTS_DIR)}`;

/** Every fixture id in this project, newest first. */
const FIXTURE_IDS = Array.from({ length: 12 }, (_, index) => `ses_recents_${String(12 - index).padStart(2, "0")}`);
/** `max-h-60` on the scroll container. */
const MAX_COLUMN_HEIGHT = 240;

/**
 * Constrain the cross-project pool to this project's fixtures.
 *
 * The BFF unions the requested directories with the *shared* pin file, so a
 * concurrent spec that pins its own project would otherwise add rows to the
 * counts below. Ids are also requested explicitly, for the same reason
 * smoke.ui.spec.ts does it: filtering a response cannot recover a session that
 * never made it into the window.
 */
async function pinRecentsToFixtures(page: Page): Promise<void> {
  await page.route("**/api/recent-sessions?*", async (route) => {
    const url = new URL(route.request().url());
    for (const id of FIXTURE_IDS) url.searchParams.append("session", id);
    const response = await route.fetch({ url: url.toString() });
    const payload = await response.json() as { sessions: Array<{ id: string }> };
    await route.fulfill({
      response,
      json: { ...payload, sessions: payload.sessions.filter(({ id }) => FIXTURE_IDS.includes(id)) },
    });
  });
}

async function seedOpenHistory(page: Page): Promise<void> {
  await page.addInitScript(({ directory, ids }) => {
    localStorage.setItem("opencode.recentSessions.v1", JSON.stringify({
      version: 1,
      // Newest first, matching what the browser writes as sessions are opened.
      entries: ids.map((id, index) => ({ id, directory, openedAt: 2_000 - index })),
    }));
  }, { directory: RECENTS_DIR, ids: FIXTURE_IDS });
}

interface Metrics { clientHeight: number; scrollHeight: number; scrollTop: number }

function metrics(page: Page, testId: string): Promise<Metrics> {
  return page.getByTestId(testId).evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
}

test.describe("recents capacity", () => {
  test("renders far more than five rows in both panels", async ({ page }) => {
    await pinRecentsToFixtures(page);
    await seedOpenHistory(page);
    await page.goto(hub);

    const opened = page.getByTestId("opencode-recently-opened-row");
    const active = page.getByTestId("opencode-recently-active-row");
    await expect(opened).toHaveCount(FIXTURE_IDS.length);
    await expect(active).toHaveCount(FIXTURE_IDS.length);
    // The bound that actually matters: strictly more than the old cap.
    expect(FIXTURE_IDS.length).toBeGreaterThan(5);

    // Newest first, and a row past the fifth is really in the DOM rather than
    // merely counted.
    await expect(active.nth(0)).toContainText("Recents fixture 12");
    await expect(active.nth(7)).toContainText("Recents fixture 05");
    await expect(opened.nth(7)).toContainText("Recents fixture 05");
  });

  test("scrolls inside a fixed section instead of growing the page", async ({ page }) => {
    await pinRecentsToFixtures(page);
    await seedOpenHistory(page);
    await page.goto(hub);
    await expect(page.getByTestId("opencode-recently-active-row")).toHaveCount(FIXTURE_IDS.length);

    const rowHeight = (await page.getByTestId("opencode-recently-active-row").first().boundingBox())?.height ?? 0;
    expect(rowHeight).toBeGreaterThanOrEqual(44);

    const section = await page.getByTestId("opencode-recent-sessions").boundingBox();
    // Twelve rows laid out in full would be ~528px tall. The section must stay
    // near its five-row height, which is the whole point of the change.
    expect(section?.height ?? 0).toBeLessThan(FIXTURE_IDS.length * rowHeight);
    expect(section?.height ?? 0).toBeLessThanOrEqual(MAX_COLUMN_HEIGHT + 80);

    for (const testId of ["opencode-recently-opened-scroll", "opencode-recently-active-scroll"]) {
      const box = await metrics(page, testId);
      expect(box.clientHeight).toBeLessThanOrEqual(MAX_COLUMN_HEIGHT);
      // Overflowing content is what makes it a scroller rather than a clip.
      expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
    }
  });

  test("scrolls each column independently without moving the page", async ({ page }) => {
    await pinRecentsToFixtures(page);
    await seedOpenHistory(page);
    await page.goto(hub);
    await expect(page.getByTestId("opencode-recently-active-row")).toHaveCount(FIXTURE_IDS.length);

    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByTestId("opencode-recently-active-scroll").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const active = await metrics(page, "opencode-recently-active-scroll");
    const opened = await metrics(page, "opencode-recently-opened-scroll");
    expect(active.scrollTop).toBeGreaterThan(0);
    // Two columns, two scrollers: moving one must not move the other.
    expect(opened.scrollTop).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);

    // The last row is reachable by scrolling, not merely clipped out of sight.
    await expect(page.getByTestId("opencode-recently-active-row").last()).toBeInViewport();
  });

  test("keeps rows keyboard reachable and scrolls focus into view", async ({ page }) => {
    await pinRecentsToFixtures(page);
    await seedOpenHistory(page);
    await page.goto(hub);
    await expect(page.getByTestId("opencode-recently-opened-row")).toHaveCount(FIXTURE_IDS.length);
    expect((await metrics(page, "opencode-recently-opened-scroll")).scrollTop).toBe(0);

    const last = page.getByTestId("opencode-recently-opened-row").last();
    await last.focus();
    await expect(last).toBeFocused();
    // Browsers scroll a focused element into its nearest scrollable ancestor,
    // which is only true because the container — not the page — is the scroller.
    expect((await metrics(page, "opencode-recently-opened-scroll")).scrollTop).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await last.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/sessions/${FIXTURE_IDS[FIXTURE_IDS.length - 1]}\\?`));
    await expect(page.getByTestId("opencode-conversation")).toBeVisible();
  });

  test("navigates from a row past the old five-row cap", async ({ page }) => {
    await pinRecentsToFixtures(page);
    await seedOpenHistory(page);
    await page.goto(hub);

    const seventh = page.getByTestId("opencode-recently-active-row").nth(6);
    await expect(seventh).toContainText("Recents fixture 06");
    await seventh.scrollIntoViewIfNeeded();
    await seventh.click();

    await expect(page).toHaveURL(new RegExp(`/sessions/ses_recents_06\\?directory=${encodeURIComponent(RECENTS_DIR)}`));
    await expect(page.getByTestId("opencode-conversation")).toBeVisible();
  });

  test("still renders the empty state when nothing was opened", async ({ page }) => {
    // A scroll wrapper must not swallow the empty message, and an empty column
    // must not force the section taller than the populated one beside it.
    await pinRecentsToFixtures(page);
    await page.goto(hub);

    await expect(page.getByTestId("opencode-recently-opened-empty")).toBeVisible();
    await expect(page.getByTestId("opencode-recently-active-row")).toHaveCount(FIXTURE_IDS.length);
    const empty = await metrics(page, "opencode-recently-opened-scroll");
    expect(empty.scrollHeight).toBeLessThanOrEqual(empty.clientHeight + 1);
  });

  test("has no horizontal overflow at 390px with a full list", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await pinRecentsToFixtures(page);
    await seedOpenHistory(page);
    await page.goto(hub);
    await expect(page.getByTestId("opencode-recently-active-row")).toHaveCount(FIXTURE_IDS.length);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
    for (const testId of ["opencode-recently-opened-scroll", "opencode-recently-active-scroll"]) {
      const box = await metrics(page, testId);
      expect(box.clientHeight).toBeLessThanOrEqual(MAX_COLUMN_HEIGHT);
      expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
    }
    // Stacked columns must still each stay within budget rather than the page
    // absorbing twenty-four rows of height.
    const section = await page.getByTestId("opencode-recent-sessions").boundingBox();
    expect(section?.height ?? 0).toBeLessThanOrEqual(2 * (MAX_COLUMN_HEIGHT + 80));
    for (const row of await page.getByTestId("opencode-recently-opened-row").all()) {
      expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
