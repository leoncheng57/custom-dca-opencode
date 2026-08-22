import { expect, test, type Page } from "@playwright/test";

// Browser tier — the built SPA against the real BFF against the mock agent.

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const SECOND_DIR = process.platform === "darwin" ? "/private/tmp/mock-second-project" : "/tmp/mock-second-project";
const hub = `/?directory=${encodeURIComponent(DIR)}`;
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;
const FORGE_URL = `http://127.0.0.1:${process.env.MOCK_PREVIEW_PORT || 4600}`;

/**
 * Constrain the cross-project recents pool to named fixture sessions.
 *
 * The mock's session list is global mutable state: any test that starts an
 * agent adds a session stamped with Date.now(), which sorts above every
 * fixture. Ordering assertions have to pin the pool or they depend on which
 * other tests happen to be running in parallel.
 */
async function pinRecentsTo(page: import("@playwright/test").Page, ids: string[]): Promise<void> {
  await page.route("**/api/recent-sessions?*", async (route) => {
    const url = new URL(route.request().url());
    // Request the fixtures by id as well as by recency. Filtering the response
    // alone is not enough: the BFF returns a newest-N window, and a session
    // another test just created can push a fixture out of it before the filter
    // ever runs.
    for (const id of ids) url.searchParams.append("session", id);
    const response = await route.fetch({ url: url.toString() });
    const payload = await response.json() as { sessions: Array<{ id: string }> };
    await route.fulfill({
      response,
      json: { ...payload, sessions: payload.sessions.filter(({ id }) => ids.includes(id)) },
    });
  });
}

async function promptPayload(text: string): Promise<Record<string, unknown> | undefined> {
  const payloads = await (await fetch(`${MOCK_URL}/test/prompt-payloads`)).json() as Array<Record<string, unknown>>;
  return payloads.find((item) => {
    const parts = item.parts as Array<{ type?: string; text?: string }> | undefined;
    return parts?.some((part) => part.type === "text" && part.text === text);
  });
}

async function selectModel(page: Page, testId: string, key: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.locator(`[data-testid="${testId}-option"][data-model-key="${key}"]`).getByRole("option").click();
}

test.describe("hub", () => {
  test("lists sessions for the directory", async ({ page }) => {
    await page.goto(hub);
    await expect(page.getByTestId("opencode-session-list")).toBeVisible();
    const rows = page.getByTestId("opencode-session-row");
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("opencode-session-list").getByText("Add a health endpoint")).toBeVisible();
    await expect(page.getByText("Old archived work")).toHaveCount(0);
  });

  test("shows a running pill for the busy session", async ({ page }) => {
    await page.goto(hub);
    const pills = page.getByTestId("opencode-session-list").getByTestId("opencode-status-pill");
    await expect(pills.filter({ hasText: "running" })).toHaveCount(1);
  });

  test("reports the upstream agent version", async ({ page }) => {
    await page.goto(hub);
    await expect(page.getByTestId("opencode-upstream-badge")).toContainText("1.18.21");
  });

  test("shows compact directory-wide auto permissions controls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(hub);
    const control = page.getByTestId("opencode-hub-auto-permissions");
    const toggle = control.getByTestId("opencode-hub-auto-permissions-toggle");
    await expect(control).toContainText("Auto permissions: OFF");
    await expect(toggle).toHaveAttribute("role", "switch");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggle).toHaveAccessibleName("Turn auto permissions on");
    expect((await control.boundingBox())?.height).toBeLessThanOrEqual(40);
    await toggle.click();
    await expect(control).toContainText("Auto permissions: ON");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toHaveAccessibleName("Turn auto permissions off");
    expect((await control.boundingBox())?.height).toBeLessThanOrEqual(40);
    await expect(control.getByTestId("opencode-hub-auto-permissions-warning")).toHaveCount(0);
    await control.getByTestId("opencode-hub-auto-permissions-details").click();
    await expect(control.getByTestId("opencode-hub-auto-permissions-warning")).toContainText("arbitrary shell commands");
    await expect(control).toContainText("every session using this project directory");
    await toggle.click();
    await expect(control).toContainText("Auto permissions: OFF");
    await expect(control.getByTestId("opencode-hub-auto-permissions-warning")).toHaveCount(0);
  });

  test("selects the configured model from the safe catalogue", async ({ page }) => {
    await page.goto(hub);
    const picker = page.getByTestId("opencode-hub-model");
    await expect(picker).toHaveAttribute("value", "anthropic/claude-opus-5");
    await picker.click();
    const pinned = page.getByTestId("opencode-hub-model-pinned-group");
    await expect(pinned).toContainText("GPT-5.6 Sol");
    await expect(pinned).toContainText("Claude Opus 5");
    await expect(page.getByTestId("opencode-hub-model-panel")).toContainText("Claude Retired");
    await expect(page.getByTestId("opencode-hub-model-panel")).toContainText("GPT-5");
  });

  test("searches models and persists user-managed pins", async ({ page }) => {
    let pins = [
      { providerID: "openai", modelID: "gpt-5.6-sol" },
      { providerID: "anthropic", modelID: "claude-opus-5" },
    ];
    await page.route("**/api/model-pins", async (route) => {
      if (route.request().method() === "PATCH") {
        pins = (route.request().postDataJSON() as { models: typeof pins }).models;
      }
      await route.fulfill({ json: { models: pins } });
    });
    await page.goto(hub);
    await page.getByTestId("opencode-hub-model").click();
    await page.getByTestId("opencode-hub-model-search").fill("sol");
    await expect(page.getByTestId("opencode-hub-model-panel")).toContainText("GPT-5.6 Sol");
    await expect(page.getByTestId("opencode-hub-model-panel")).not.toContainText("Claude Opus 5");
    const sol = page.locator('[data-testid="opencode-hub-model-option"][data-model-key="openai/gpt-5.6-sol"]');
    await sol.getByTestId("opencode-hub-model-pin").click();
    await expect.poll(() => pins).toEqual([{ providerID: "anthropic", modelID: "claude-opus-5" }]);
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByTestId("opencode-hub-model").click();
    await expect(page.getByTestId("opencode-hub-model-pinned-group")).not.toContainText("GPT-5.6 Sol");
    await expect(page.getByTestId("opencode-hub-model-panel")).toContainText("GPT-5.6 Sol");
  });

  test("prompts for a directory when none is set", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await expect(page.getByTestId("opencode-start")).toBeDisabled();
  });

  test("searches project cards and keeps manual paths as an advanced fallback", async ({ page }) => {
    await page.goto(hub);
    const mockProject = page.getByTestId("opencode-project-card").filter({
      has: page.getByText("mock-project", { exact: true }),
    });
    await expect(mockProject).toBeVisible();
    const projectList = page.getByTestId("opencode-project-list");
    expect(await projectList.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
    expect(await projectList.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(288);
    expect((await mockProject.boundingBox())?.height).toBeLessThanOrEqual(48);
    await page.getByTestId("opencode-project-search").fill("no-project-has-this-name");
    await expect(mockProject).toHaveCount(0);
    await expect(page.getByTestId("opencode-directory-input")).not.toBeVisible();
    await page.getByTestId("opencode-directory-advanced-toggle").click();
    await expect(page.getByTestId("opencode-directory-input")).toBeVisible();
  });

  test("pins a project with the always-visible card action", async ({ page }) => {
    let directories: string[] = [];
    await page.route("**/api/project-pins", async (route) => {
      if (route.request().method() === "PATCH") {
        directories = (route.request().postDataJSON() as { directories: string[] }).directories;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ directories }) });
    });
    await page.goto(hub);
    const mockProject = page.getByTestId("opencode-project-card").filter({
      has: page.getByText("mock-project", { exact: true }),
    });
    const pin = mockProject.getByTestId("opencode-project-pin");
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(pin).toHaveAttribute("aria-pressed", "true");
  });

  test("shows an advisory running-session warning only outside isolated mode", async ({ page }) => {
    await page.goto(hub);
    await expect(page.getByTestId("opencode-session-collision-warning")).toBeVisible();
    await page.getByTestId("opencode-isolated-workspace").check();
    await expect(page.getByTestId("opencode-session-collision-warning")).toHaveCount(0);
  });

  test("keeps an undiscovered URL workspace selected", async ({ page }) => {
    const other = `${DIR}/src`;
    await page.goto(`/?directory=${encodeURIComponent(other)}`);
    await expect(page.getByTestId("opencode-other-workspace")).toContainText("Other workspace");
    await expect(page.getByTestId("opencode-project-select-other")).toHaveAttribute("aria-pressed", "true");
  });

  test("navigating to a session keeps the directory scope", async ({ page }) => {
    await page.goto(hub);
    await page.getByTestId("opencode-session-row").first().click();
    await expect(page).toHaveURL(/\/sessions\/.*directory=/);
    await expect(page.getByTestId("opencode-conversation")).toBeVisible();
  });

  test("orders recently opened independently from recently active and persists reloads", async ({ page }) => {
    // Constrain the cross-project pool to this project so the ordering
    // assertions stay about opened-vs-active, not about project merging.
    await pinRecentsTo(page, ["ses_mock_done", "ses_mock_running", "ses_mock_unknown_model"]);
    await page.goto(hub);
    const sessions = page.getByTestId("opencode-session-list");

    await sessions.getByText("Add a health endpoint", { exact: true }).click();
    await page.getByRole("link", { name: "Sessions" }).click();
    await sessions.getByText("Refactor the parser", { exact: true }).click();
    await page.getByRole("link", { name: "Sessions" }).click();

    const openedRows = page.getByTestId("opencode-recently-opened-row");
    await expect(openedRows).toHaveCount(2);
    expect(await openedRows.allTextContents()).toEqual([
      expect.stringContaining("Refactor the parser"),
      expect.stringContaining("Add a health endpoint"),
    ]);

    const activeRows = page.getByTestId("opencode-recently-active-row");
    await expect(activeRows).toHaveCount(3);
    expect(await activeRows.allTextContents()).toEqual([
      expect.stringContaining("Imported unknown model"),
      expect.stringContaining("Refactor the parser"),
      expect.stringContaining("Add a health endpoint"),
    ]);
    for (const row of await openedRows.all()) {
      await expect(row).toHaveAttribute("href", new RegExp(`directory=${encodeURIComponent(DIR)}`));
    }
    for (const row of await activeRows.all()) {
      await expect(row).toHaveAttribute("href", new RegExp(`directory=${encodeURIComponent(DIR)}`));
    }

    await page.reload();
    await expect(page.getByTestId("opencode-recently-opened-row")).toHaveCount(2);
    expect(await page.getByTestId("opencode-recently-opened-row").allTextContents()).toEqual([
      expect.stringContaining("Refactor the parser"),
      expect.stringContaining("Add a health endpoint"),
    ]);
  });

  test("shows recents from another project, labelled by project", async ({ page }) => {
    // Previously this asserted the opposite — that an entry from another
    // directory stayed hidden. Recents are cross-project now, so the row must
    // appear, and it must be attributed to the project it came from.
    await page.addInitScript(({ directory }) => {
      localStorage.setItem("opencode.recentSessions.v1", JSON.stringify({
        version: 1,
        entries: [{ id: "ses_second_oldest", directory, openedAt: Date.now() }],
      }));
    }, { directory: SECOND_DIR });
    await page.goto(hub);

    const openedRows = page.getByTestId("opencode-recently-opened-row");
    await expect(openedRows).toHaveCount(1);
    await expect(openedRows.first()).toContainText("Second project oldest");
    await expect(openedRows.first()).toContainText("mock-second-project");
    await expect(openedRows.first()).toHaveAttribute(
      "href",
      new RegExp(`directory=${encodeURIComponent(SECOND_DIR)}`),
    );
  });

  test("ignores recents entries pointing outside the projects root", async ({ page }) => {
    // localStorage outlives renames and moves between machines; a stale path
    // must be dropped rather than breaking the whole panel.
    await page.addInitScript(() => {
      localStorage.setItem("opencode.recentSessions.v1", JSON.stringify({
        version: 1,
        entries: [{ id: "ses_mock_done", directory: "/nonexistent/project", openedAt: Date.now() }],
      }));
    });
    await page.goto(hub);
    await expect(page.getByTestId("opencode-recently-opened-empty")).toBeVisible();
    await expect(page.getByTestId("opencode-recently-active-row").first()).toBeVisible();
  });

  test("merges recently active across projects newest first", async ({ page }) => {
    await pinRecentsTo(page, [
      "ses_second_newest",
      "ses_mock_unknown_model",
      "ses_mock_running",
      "ses_mock_done",
      "ses_second_oldest",
    ]);
    await page.addInitScript(({ directory }) => {
      localStorage.setItem("opencode.recentSessions.v1", JSON.stringify({
        version: 1,
        entries: [{ id: "ses_second_oldest", directory, openedAt: Date.now() }],
      }));
    }, { directory: SECOND_DIR });
    await page.goto(hub);

    const activeRows = page.getByTestId("opencode-recently-active-row");
    await expect(activeRows).toHaveCount(5);
    // Interleaved by time, not grouped by project: that is the whole point.
    expect(await activeRows.allTextContents()).toEqual([
      expect.stringContaining("Second project newest"),
      expect.stringContaining("Imported unknown model"),
      expect.stringContaining("Refactor the parser"),
      expect.stringContaining("Add a health endpoint"),
      expect.stringContaining("Second project oldest"),
    ]);
    expect(await activeRows.first().textContent()).toContain("mock-second-project");
  });

  test("shows recents before any project is chosen", async ({ page }) => {
    await pinRecentsTo(page, ["ses_second_newest", "ses_second_oldest"]);
    await page.addInitScript(({ directory }) => {
      localStorage.setItem("opencode.recentSessions.v1", JSON.stringify({
        version: 1,
        entries: [{ id: "ses_second_oldest", directory, openedAt: Date.now() }],
      }));
    }, { directory: SECOND_DIR });
    // No ?directory= and no stored selection: the panel must still render.
    await page.goto("/");

    await expect(page.getByTestId("opencode-recent-sessions")).toBeVisible();
    await expect(page.getByTestId("opencode-recently-active-row")).toHaveCount(2);
    await expect(page.getByTestId("opencode-recently-active-row").first())
      .toContainText("Second project newest");
    // Still genuinely unscoped: the session list below has no project to show.
    await expect(page.getByText("Pick a project directory to list its sessions.")).toBeVisible();
  });

  test("keeps recent rows usable without overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.addInitScript(({ directory }) => {
      localStorage.setItem("opencode.recentSessions.v1", JSON.stringify({
        version: 1,
        entries: [
          { id: "ses_mock_running", directory, openedAt: 2 },
          { id: "ses_mock_done", directory, openedAt: 1 },
        ],
      }));
    }, { directory: DIR });
    await page.goto(hub);
    const recent = page.getByTestId("opencode-recent-sessions");
    const newTask = page.getByTestId("opencode-new-task");
    await expect(recent).toBeVisible();
    expect(await recent.evaluate((element, task) => Boolean(element.compareDocumentPosition(task) & Node.DOCUMENT_POSITION_FOLLOWING), await newTask.elementHandle())).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const componentBox = await recent.boundingBox();
    const newTaskBox = await newTask.boundingBox();
    expect(componentBox?.y).toBeLessThan(newTaskBox?.y ?? 0);
    expect(componentBox?.width).toBeLessThanOrEqual(358);
    for (const row of await page.getByTestId("opencode-recently-opened-row").all()) {
      expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("starts the initial prompt in Plan mode", async ({ page }) => {
    const text = `initial plan ${Date.now()}`;
    await page.goto(hub);
    await expect(page.getByTestId("opencode-hub-mode")).toBeVisible();
    await page.getByTestId("opencode-hub-mode-plan").click();
    await page.getByTestId("opencode-prompt").fill(text);
    await page.getByTestId("opencode-start").click();
    await expect(page).toHaveURL(/\/sessions\/ses_mock_new_/);
    await expect.poll(() => promptPayload(text)).toMatchObject({ agent: "plan" });
    await expect(page.getByTestId("opencode-composer-mode-plan")).toHaveAttribute("aria-pressed", "true");
  });

  test("starts with an explicit variant while keeping Plan independent", async ({ page }) => {
    const text = `initial variant plan ${Date.now()}`;
    await page.goto(hub);
    await page.getByTestId("opencode-hub-mode-plan").click();
    await page.getByTestId("opencode-hub-model").click();
    await page.getByTestId("opencode-hub-model-variant").filter({ hasText: "high" }).click();
    await expect(page.getByTestId("opencode-hub-mode-plan")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("opencode-prompt").fill(text);
    await page.getByTestId("opencode-start").click();
    await expect.poll(() => promptPayload(text)).toMatchObject({
      agent: "plan",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
      variant: "high",
    });
  });
});

test.describe("phone transfer", () => {
  test("opens with the configured URL, copies it, and closes", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(hub);
    await page.getByTestId("opencode-phone-transfer-open").click();

    const dialog = page.getByTestId("opencode-phone-transfer-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("opencode-phone-transfer-url")).toHaveText("https://ide.e2e.example.test:8443");
    await expect(dialog.getByRole("img")).toBeVisible();

    await page.getByTestId("opencode-phone-transfer-copy").click();
    await expect(page.getByTestId("opencode-phone-transfer-copy-status")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://ide.e2e.example.test:8443");

    await page.getByTestId("opencode-phone-transfer-close").click();
    await expect(dialog).toHaveCount(0);
  });

  test("targets the active conversation", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-phone-transfer-open").click();

    await expect(page.getByTestId("opencode-phone-transfer-url")).toHaveText(
      `https://ide.e2e.example.test:8443/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`,
    );
  });

  test("dialog fits without horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(hub);
    await page.getByTestId("opencode-phone-transfer-open").click();
    await expect(page.getByTestId("opencode-phone-transfer-dialog")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("transcript", () => {
  const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;
  const mobileConversation = `/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`;
  const paginatedConversation = `/sessions/ses_mock_paginated?directory=${encodeURIComponent(DIR)}`;

  const navigateInApp = async (page: import("@playwright/test").Page, url: string) => {
    await page.evaluate((next) => {
      history.pushState({}, "", next);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, url);
  };

  test("renders every row kind from the fixture", async ({ page }) => {
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-transcript")).toBeVisible();
    await expect(page.getByTestId("opencode-user-message").first()).toBeVisible();
    await expect(page.getByTestId("opencode-agent-message")).toBeVisible();
    await expect(page.getByTestId("opencode-thought")).toHaveCount(1);
    await expect(page.getByTestId("opencode-status-separator").first()).toBeVisible();
  });

  test("rejects stale poll completions across A to B to A and hides old actionable state immediately", async ({ page }) => {
    let releaseMessages!: () => void;
    let releaseTodos!: () => void;
    let messagesHeld = false;
    let todosHeld = false;
    const messageGate = new Promise<void>((resolve) => { releaseMessages = resolve; });
    const todoGate = new Promise<void>((resolve) => { releaseTodos = resolve; });

    await page.route("**/api/sessions/ses_mock_done/messages?**", async (route) => {
      if (!messagesHeld) {
        messagesHeld = true;
        await messageGate;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            messages: [{ info: { id: "msg_stale", role: "assistant", time: { created: 1, completed: 1 } }, parts: [{ id: "prt_stale", messageID: "msg_stale", type: "text", text: "STALE A RESPONSE" }] }],
            running: false,
            nextCursor: null,
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/sessions/ses_mock_done/todos?**", async (route) => {
      if (!todosHeld) {
        todosHeld = true;
        await todoGate;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ todos: [{ content: "STALE TODO", status: "pending", priority: "high" }] }) });
        return;
      }
      await route.continue();
    });

    await page.goto(conversation);
    await expect.poll(() => messagesHeld && todosHeld).toBe(true);
    await navigateInApp(page, mobileConversation);
    await expect(page.getByTestId("opencode-session-title")).toHaveText("Mobile full session fixture");
    await expect(page.getByTestId("opencode-permission-request")).toHaveCount(0);
    await expect(page.getByTestId("opencode-question-request")).toHaveCount(0);
    await navigateInApp(page, conversation);
    await expect(page.getByText("Add a health endpoint to the server.")).toBeVisible();

    releaseMessages();
    releaseTodos();
    await expect(page.getByText("STALE A RESPONSE", { exact: true })).toHaveCount(0);
    await expect(page.getByText("STALE TODO", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("opencode-todo-list")).toContainText("Add the route");
  });

  test("hides seeded permission and question state on a session transition", async ({ page }) => {
    await fetch(`${MOCK_URL}/test/permissions/reset?directory=${encodeURIComponent(DIR)}`, { method: "POST" });
    await fetch(`${MOCK_URL}/test/questions/reset?scope=ui`, { method: "POST" });
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-permission-request")).toBeVisible();
    await expect(page.getByTestId("opencode-question-request")).toBeVisible();
    await navigateInApp(page, mobileConversation);
    await expect(page.getByTestId("opencode-permission-request")).toHaveCount(0);
    await expect(page.getByTestId("opencode-question-request")).toHaveCount(0);
  });

  test("rejects stale earlier-page completion after revisiting the same session", async ({ page }) => {
    let releaseBackfill!: () => void;
    let held = false;
    const gate = new Promise<void>((resolve) => { releaseBackfill = resolve; });
    await page.route("**/api/sessions/ses_mock_paginated/messages?**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.has("before") && !held) {
        held = true;
        await gate;
      }
      await route.continue();
    });

    await page.goto(paginatedConversation);
    await page.getByTestId("opencode-load-earlier").click({ noWaitAfter: true });
    await expect.poll(() => held).toBe(true);
    await navigateInApp(page, mobileConversation);
    await expect(page.getByTestId("opencode-session-title")).toHaveText("Mobile full session fixture");
    await navigateInApp(page, paginatedConversation);
    await expect(page.getByText("Paged message 126", { exact: true })).toBeVisible();
    releaseBackfill();
    await expect(page.getByText("Paged message 1", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("opencode-load-earlier")).toBeVisible();
  });

  test("keeps older pages for newest part updates and cancels backfill for older updates", async ({ page }) => {
    let release!: () => void;
    let held = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/sessions/ses_mock_paginated/messages?**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("before") === "25" && !held) { held = true; await gate; }
      await route.continue();
    });
    await page.goto(paginatedConversation);
    await page.getByTestId("opencode-load-earlier").click();
    await expect(page.getByText("Paged message 50", { exact: true })).toBeVisible();
    await fetch(`${MOCK_URL}/test/paginated/newest-update`, { method: "POST" });
    await expect(page.getByText("Paged message 50", { exact: true })).toBeVisible();
    await page.getByTestId("opencode-load-earlier").click({ noWaitAfter: true });
    await expect.poll(() => held).toBe(true);
    await fetch(`${MOCK_URL}/test/paginated/pending-update`, { method: "POST" });
    await expect(page.getByText("Paged message 50", { exact: true })).toBeVisible();
    release();
    await expect(page.getByText("Paged message 1", { exact: true })).toHaveCount(0);
  });

  test("cancels complete command export when the inspector unmounts", async ({ page }) => {
    let newestRequests = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/sessions/ses_mock_paginated/messages?**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has("before") && ++newestRequests === 2) await gate;
      await route.continue();
    });
    let downloads = 0;
    page.on("download", () => { downloads += 1; });
    await page.goto(paginatedConversation);
    await page.getByTestId("opencode-inspector-runlog").click();
    await page.getByTestId("opencode-export-commands").click({ noWaitAfter: true });
    await page.getByRole("link", { name: "Sessions" }).click();
    release();
    await page.waitForTimeout(200);
    expect(downloads).toBe(0);
  });

  test("shows the reasoning duration OpenHands could not", async ({ page }) => {
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-thought")).toContainText("2.0s");
  });

  test("shows live context usage against the model limit", async ({ page }) => {
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-context-tokens")).toContainText("%");
  });

  // Encrypted-only reasoning must not produce an empty row.
  test("drops reasoning that carries no readable text", async ({ page }) => {
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-thought")).toHaveCount(1);
  });

  test("expands a tool call to reveal its output", async ({ page }) => {
    await page.goto(conversation);
    const tool = page.getByTestId("opencode-tool").first();
    // The composer/question panel may geometrically overlap this transcript
    // row at CI's viewport. Keyboard activation tests the same accessible
    // button behavior without making the assertion depend on pointer layout.
    await tool.getByRole("button").press("Enter");
    await expect(tool).toContainText("export const app = express()");
  });

  test("marks a failed tool call", async ({ page }) => {
    await page.goto(conversation);
    const failed = page.getByTestId("opencode-tool").filter({ hasText: "webfetch" });
    await expect(failed).toHaveAttribute("data-status", "error");
  });

  test("renders the task list from the todo endpoint", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(conversation);
    const tasks = page.getByTestId("opencode-todo-list");
    await expect(tasks).toContainText("1/3 done");
    await expect(tasks).toContainText("Add the route");
  });

  test("never leaks provider signatures into the DOM", async ({ page }) => {
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-transcript")).toBeVisible();
    const html = await page.getByTestId("opencode-transcript").innerHTML();
    expect(html).not.toContain("OPAQUE_SIGNATURE_MUST_NOT_RENDER");
    expect(html).not.toContain("ENCRYPTED_ONLY_NO_TEXT");
  });

  test("tolerates an unknown part type", async ({ page }) => {
    await page.goto(conversation);
    // The fixture contains "some-future-part-type"; the transcript must render.
    await expect(page.getByTestId("opencode-transcript")).toBeVisible();
    expect(await page.getByTestId("opencode-error").count()).toBe(0);
  });
});

test.describe("interrupted runs", () => {
  // The mock's running session has no completed assistant turn, and the mock
  // reports it busy — so it must NOT be flagged.
  test("does not flag a session that is genuinely running", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_running?directory=${encodeURIComponent(DIR)}`);
    await expect(page.getByTestId("opencode-conversation")).toBeVisible();
    await expect(page.getByTestId("opencode-interrupted")).toHaveCount(0);
  });
});

test.describe("composer", () => {
  test("auto-approves once, leaves questions visible, and surfaces reply failures", async ({ page, request }) => {
    await request.patch(`/api/auto-approve?directory=${DIR}`, { data: { enabled: false } });
    await fetch(`${MOCK_URL}/test/permissions/reset?directory=${encodeURIComponent(DIR)}`, { method: "POST" });
    await fetch(`${MOCK_URL}/test/questions/reset?scope=api`, { method: "POST" });
    await page.goto(`/sessions/ses_mock_running?directory=${encodeURIComponent(DIR)}`);
    const control = page.getByTestId("opencode-conversation-auto-permissions");
    await expect(control).toContainText("Auto permissions: OFF");
    await control.getByTestId("opencode-conversation-auto-permissions-toggle").click();
    await expect(control).toContainText("Auto permissions: ON");

    const id = `perm_auto_${Date.now()}`;
    await fetch(`${MOCK_URL}/test/permission?directory=${encodeURIComponent(DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sessionID: "ses_mock_running", permission: "bash", patterns: ["npm test"] }),
    });
    await expect.poll(async () => await (await fetch(`${MOCK_URL}/test/permission-replies`)).json())
      .toContainEqual({ id, reply: "once" });
    await expect(page.getByTestId("opencode-permission-request").filter({ hasText: "npm test" })).toHaveCount(0);
    await expect(page.getByTestId("opencode-question-request")).toBeVisible();

    const failedID = `perm_fail_auto_${Date.now()}`;
    await fetch(`${MOCK_URL}/test/permission?directory=${encodeURIComponent(DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: failedID, sessionID: "ses_mock_running", permission: "external_directory", patterns: ["/tmp/*"] }),
    });
    await expect(control.getByTestId("opencode-conversation-auto-permissions-error"))
      .toContainText("Could not auto-approve external_directory");
    await expect(page.getByTestId("opencode-permission-request").filter({ hasText: "/tmp/*" })).toBeVisible();

    await control.getByTestId("opencode-conversation-auto-permissions-toggle").click();
    await expect(control).toContainText("Auto permissions: OFF");
    await fetch(`${MOCK_URL}/test/permissions/reset?directory=${encodeURIComponent(DIR)}`, { method: "POST" });
  });

  test("approves a permission and continues the conversation", async ({ page, request: apiRequest }) => {
    await apiRequest.patch(`/api/auto-approve?directory=${DIR}`, { data: { enabled: false } });
    const id = `perm_continue_${Date.now()}`;
    await fetch(`${MOCK_URL}/test/permission?directory=${encodeURIComponent(DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sessionID: "ses_mock_running", permission: "external_directory", patterns: [`${DIR}/${id}/*`] }),
    });
    await page.goto(`/sessions/ses_mock_running?directory=${encodeURIComponent(DIR)}`);
    const request = page.getByTestId("opencode-permission-request").filter({ hasText: id });
    await expect(request).toBeVisible();
    await request.getByTestId("opencode-permission-once").click();
    await expect(request).toHaveCount(0);
    await expect(page.getByTestId("opencode-agent-message").filter({ hasText: "Permission approved; continuing" })).toBeVisible();
    const replies = await (await fetch(`${MOCK_URL}/test/permission-replies`)).json() as Array<{ id: string; reply: string }>;
    expect(replies).toContainEqual({ id, reply: "once" });
  });

  test("keeps a failed permission reply visible and retryable", async ({ page, request: apiRequest }) => {
    await apiRequest.patch(`/api/auto-approve?directory=${DIR}`, { data: { enabled: false } });
    const id = `perm_fail_${Date.now()}`;
    await fetch(`${MOCK_URL}/test/permission?directory=${encodeURIComponent(DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sessionID: "ses_mock_running", permission: "bash", patterns: [`npm test ${id}`] }),
    });
    await page.goto(`/sessions/ses_mock_running?directory=${encodeURIComponent(DIR)}`);
    const request = page.getByTestId("opencode-permission-request").filter({ hasText: id });
    await expect(request).toBeVisible();
    await request.getByTestId("opencode-permission-once").click();
    await expect(page.getByTestId("opencode-permission-error")).toContainText("mock permission reply failed");
    await expect(request).toBeVisible();
    await expect(request.getByTestId("opencode-permission-once")).toBeEnabled();
  });

  test("sends a follow-up", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-composer").fill("do the thing");
    await page.getByTestId("opencode-send").click();
    await expect(page.getByTestId("opencode-composer")).toHaveValue("");
  });

  test("submits on Enter and keeps Shift+Enter as a newline", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const composer = page.getByTestId("opencode-composer");

    await composer.click();
    await composer.type("first line");
    await composer.press("Shift+Enter");
    await composer.type("second line");
    await expect(composer).toHaveValue("first line\nsecond line");

    await composer.press("Enter");
    await expect(composer).toHaveValue("");
  });

  test("does not submit an empty or whitespace-only draft on Enter", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const composer = page.getByTestId("opencode-composer");

    await composer.click();
    await composer.press("Enter");
    await composer.type("   ");
    await composer.press("Enter");

    // Enter is swallowed rather than inserting a newline, and the draft is kept
    // rather than cleared, which is what sending would do. The transcript is
    // deliberately not asserted on: this mock session is shared with the other
    // composer tests, so its contents change underneath a parallel worker.
    await expect(composer).toHaveValue("   ");
    await expect(page.getByTestId("opencode-send")).toBeDisabled();
  });

  test("accepts an image attachment", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-attach").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
    await expect(page.getByTestId("opencode-attachment-chip")).toContainText("pixel.png");
    await page.getByTestId("opencode-composer").fill("inspect this");
    await page.getByTestId("opencode-send").click();
    await expect(page.getByTestId("opencode-attachment-chip")).toHaveCount(0);
  });

  test("pastes an image without consuming pasted text and reports invalid files", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const composer = page.getByTestId("opencode-composer");
    await composer.fill("keep this text");
    await composer.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "pasted.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await expect(composer).toHaveValue("keep this text");
    await expect(page.getByTestId("opencode-attachment-chip")).toContainText("pasted.png");

    await page.getByTestId("opencode-attach").setInputFiles({ name: "page.html", mimeType: "text/html", buffer: Buffer.from("<img src=https://example.test/x.png>") });
    await expect(page.getByTestId("opencode-attachment-error")).toContainText("Use PNG, JPEG, GIF, or WebP");
  });

  test("disables send when empty", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await expect(page.getByTestId("opencode-send")).toBeDisabled();
  });

  test("shows an actionable identity error when the server rejects a stale bounded client view", async ({ page }) => {
    await page.route("**/api/sessions/ses_mock_identity_mismatch/messages?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [{ info: { id: "msg_client_build", role: "user", agent: "build" }, parts: [] }],
          running: false,
          nextCursor: null,
        }),
      });
    });
    await page.goto(`/sessions/ses_mock_identity_mismatch?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-composer").fill("do not silently switch agents");
    await expect(page.getByTestId("opencode-send")).toBeEnabled();
    await page.getByTestId("opencode-send").click();

    await expect(page.getByTestId("opencode-composer-error")).toContainText('uses OpenCode agent "explore"');
    await expect(page.getByTestId("opencode-composer-error")).toContainText("continue it in the TUI");
    await expect(page.getByTestId("opencode-composer-error")).not.toContainText("Could not send the prompt");
    await expect(page.getByTestId("opencode-composer")).toHaveValue("do not silently switch agents");
  });

  test("persists the selected mode from the latest message across reload", async ({ page }) => {
    const text = `follow-up plan ${Date.now()}`;
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await expect(page.getByTestId("opencode-composer-mode")).toBeVisible();
    await page.getByTestId("opencode-composer-mode-plan").click();
    await page.getByTestId("opencode-composer").fill(text);
    await page.getByTestId("opencode-send").click();
    await expect.poll(() => promptPayload(text)).toMatchObject({ agent: "plan" });
    await page.reload();
    await expect(page.getByTestId("opencode-composer-mode-plan")).toHaveAttribute("aria-pressed", "true");
  });

  test("switches models once, persists the new current model, and omits unchanged overrides", async ({ page }) => {
    const initial = `model initial ${Date.now()}`;
    await page.goto(hub);
    await selectModel(page, "opencode-hub-model", "openai/gpt-5");
    await page.getByTestId("opencode-prompt").fill(initial);
    await page.getByTestId("opencode-start").click();
    await expect(page).toHaveURL(/\/sessions\/ses_mock_new_/);
    await expect.poll(() => promptPayload(initial)).toMatchObject({
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-5" },
    });
    const picker = page.getByTestId("opencode-composer-model");
    await expect(picker).toHaveAttribute("value", "openai/gpt-5");
    await expect(page.getByTestId("opencode-current-model")).toBeHidden();

    const unchanged = `model unchanged ${Date.now()}`;
    await page.getByTestId("opencode-composer").fill(unchanged);
    await page.getByTestId("opencode-send").click();
    await expect.poll(() => promptPayload(unchanged)).not.toHaveProperty("model");

    const switched = `model switched ${Date.now()}`;
    await selectModel(page, "opencode-composer-model", "anthropic/claude-opus-5");
    await expect(page.getByTestId("opencode-current-model")).toContainText("switches next message");
    await page.getByTestId("opencode-composer").fill(switched);
    await page.getByTestId("opencode-send").click();
    await expect.poll(() => promptPayload(switched)).toMatchObject({
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
    });
    await expect(page.getByTestId("opencode-current-model")).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("opencode-composer-model")).toHaveAttribute("value", "anthropic/claude-opus-5");
  });

  test("shows an image capability warning without changing Plan/Build", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-composer-mode-plan").click();
    await selectModel(page, "opencode-composer-model", "anthropic/claude-text");
    await expect(page.getByTestId("opencode-composer-mode-plan")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("opencode-attach").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
    await expect(page.getByTestId("opencode-model-image-warning")).toBeVisible();
  });

  test("keeps an unknown persisted model visible instead of silently replacing it", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_unknown_model?directory=${encodeURIComponent(DIR)}`);
    const picker = page.getByTestId("opencode-composer-model");
    await expect(picker).toHaveAttribute("value", "legacy/removed-model");
    await expect(picker).toContainText("unknown");
  });

  test("round-trips two imported reminders by ID and resets the picker", async ({ page }) => {
    const sent: Array<Record<string, unknown>> = [];
    await page.route("**/api/sessions/*/prompt?*", async (route) => {
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.continue();
    });
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const picker = page.getByTestId("composer-reminder-select");
    await expect(picker).toBeVisible();
    await picker.click();
    await expect(page.getByTestId("composer-reminder-search")).toBeFocused();
    const humanVerification = page.locator('[data-testid="composer-reminder-option"][data-reminder-id="human-verification-steps"]');
    await expect(humanVerification).toContainText("Write Human Verification Steps");
    await expect(humanVerification).toContainText("verifies completed behavior from a user's perspective");
    await page.getByTestId("composer-reminder-search").fill("Red-Team");
    await expect(page.getByTestId("composer-reminder-option")).toHaveCount(1);
    await expect(page.getByTestId("composer-reminder-option")).toContainText("Red-Team This");
    await page.getByTestId("composer-reminder-search").press("ArrowDown");
    await page.getByTestId("composer-reminder-search").press("Enter");
    await expect(picker).toHaveAttribute("value", "red-team-this");
    await picker.click();
    await page.getByTestId("composer-reminder-option-none").click();
    await expect(picker).toHaveAttribute("value", "");
    await expect(picker).toBeFocused();

    const cases = [
      { id: "red-team-this", text: `red team ${Date.now()}`, body: "Explicitly switch from author" },
      { id: "human-verification-steps", text: `manual QA ${Date.now()}`, body: "Run the repository's relevant automated checks" },
    ];
    for (const reminderCase of cases) {
      await picker.click();
      await page.locator(`[data-testid="composer-reminder-option"][data-reminder-id="${reminderCase.id}"]`).click();
      await expect(picker).toHaveAttribute("value", reminderCase.id);
      await page.getByTestId("opencode-composer").fill(reminderCase.text);
      await page.getByTestId("opencode-send").click();
      await expect(picker).toHaveAttribute("value", "");

      const user = page.getByTestId("opencode-user-message").filter({ hasText: reminderCase.text });
      await expect(user).toBeVisible();
      await expect(user.getByTestId("opencode-user-message-body")).toHaveText(reminderCase.text);
      const reminder = user.getByTestId("opencode-manual-reminder");
      await expect(reminder).toHaveAttribute("open", "");
      await expect(reminder).toContainText(reminderCase.id);
      await expect(reminder).toContainText(reminderCase.body);
      await expect(user).not.toContainText("<reminder");
    }

    expect(sent).toHaveLength(2);
    expect(sent.map(({ reminder }) => reminder)).toEqual(cases.map(({ id }) => id));
    for (const payload of sent) {
      expect(Object.keys(payload).sort()).toEqual(["mode", "reminder", "text"]);
      expect(payload).not.toHaveProperty("reminderBody");
      expect(JSON.stringify(payload)).not.toContain("source_commit");
    }
  });
});

test.describe("mobile", () => {
  // Mobile over Tailscale is a first-class surface, not an afterthought.
  test.use({ viewport: { width: 390, height: 740 }, hasTouch: true });

  test.beforeEach(async () => {
    await fetch(`${MOCK_URL}/test/mobile/reset`, { method: "POST" });
  });

  test("hub is usable on a phone", async ({ page }) => {
    await page.goto(hub);
    await expect(page.getByTestId("opencode-session-list")).toBeVisible();
    await expect(page.getByTestId("opencode-project-list")).toBeVisible();
    await expect(page.getByTestId("opencode-hub-mode")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal scroll on a phone").toBeLessThanOrEqual(1);
  });

  test("transcript is the only scrolling region", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const transcript = page.getByTestId("opencode-transcript");
    await expect(transcript).toBeVisible();
    await expect(page.getByTestId("opencode-composer-mode")).toBeVisible();
    const autoPermissions = page.getByTestId("opencode-conversation-auto-permissions");
    await expect(autoPermissions).toContainText("Auto permissions: OFF");
    expect((await autoPermissions.boundingBox())?.height).toBeLessThanOrEqual(72);
    const containment = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverscroll: getComputedStyle(document.body).overscrollBehaviorY,
      documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
    }));
    expect(containment.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(containment.bodyOverscroll).toBe("none");
    expect(containment.documentScrollTop).toBe(0);
    expect(await transcript.evaluate((element) => getComputedStyle(element).overscrollBehaviorY)).toBe("contain");
  });

  test("gives the composer useful typing space and keeps controls reachable", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`);
    const composer = page.getByTestId("opencode-composer");
    const reminder = page.getByTestId("composer-reminder-select");
    const [composerBox, reminderBox, attachBox, sendBox] = await Promise.all([
      composer.boundingBox(),
      reminder.boundingBox(),
      page.getByTestId("opencode-attach-label").boundingBox(),
      page.getByTestId("opencode-send").boundingBox(),
    ]);
    expect(composerBox?.width).toBeGreaterThan((reminderBox?.width ?? 0) * 2);
    expect(composerBox?.height).toBeGreaterThanOrEqual(96);
    expect(attachBox?.height).toBeGreaterThanOrEqual(44);
    expect(sendBox?.height).toBeGreaterThanOrEqual(44);
    await expect(composer).toHaveAttribute("enterkeyhint", "enter");
    await expect(composer).toHaveAttribute("autocapitalize", "none");
    await reminder.click();
    const panel = page.getByTestId("composer-reminder-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("composer-reminder-option").first()).toContainText("Draw an ASCII Diagram");
    const panelBox = await panel.boundingBox();
    expect(panelBox?.width).toBeLessThanOrEqual(390);
    expect(panelBox?.height).toBeLessThanOrEqual(740);
    await page.getByTestId("composer-reminder-close").click();
    await expect(reminder).toBeFocused();
  });

  test("collapses the composer without losing its draft", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`);
    const composer = page.getByTestId("opencode-composer");
    await composer.fill("unfinished mobile thought");
    const expandedHeight = (await page.getByTestId("opencode-conversation").locator("footer").boundingBox())?.height ?? 0;
    await page.getByTestId("opencode-composer-collapse").click();
    await expect(composer).toBeHidden();
    const collapsedHeight = (await page.getByTestId("opencode-conversation").locator("footer").boundingBox())?.height ?? 0;
    expect(collapsedHeight).toBeLessThan(expandedHeight / 2);
    await page.getByTestId("opencode-composer-expand").click();
    await expect(composer).toHaveValue("unfinished mobile thought");
    await expect(composer).toBeFocused();
  });

  // The Enter-vs-newline decision itself is covered in tests/composer-keys.test.ts:
  // Playwright launches Chromium with a browser-level primaryPointerType of
  // "fine", so `hasTouch` does not move `(pointer: coarse)` and this suite
  // cannot faithfully emulate the soft-keyboard branch.
  test("submits with Cmd/Ctrl+Enter regardless of pointer type", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`);
    const composer = page.getByTestId("opencode-composer");
    await composer.click();
    await composer.type("send from a phone");
    await composer.press("ControlOrMeta+Enter");
    await expect(composer).toHaveValue("");
  });

  test("contains hostile markdown width inside local code and table scrollers", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`);
    const transcript = page.getByTestId("opencode-transcript");
    await expect(transcript.getByText("Mobile width containment fixture.")).toBeVisible();
    const containment = await transcript.evaluate((element) => {
      const code = element.querySelector(".prose-markdown pre") as HTMLElement;
      const table = element.querySelector(".prose-markdown table") as HTMLElement;
      const prose = element.querySelector(".prose-markdown") as HTMLElement;
      return {
        transcriptOverflow: element.scrollWidth - element.clientWidth,
        proseOverflow: prose.scrollWidth - prose.clientWidth,
        codeScrollsLocally: code.scrollWidth > code.clientWidth,
        tableScrollsLocally: table.scrollWidth > table.clientWidth,
      };
    });
    expect(containment.transcriptOverflow).toBeLessThanOrEqual(1);
    expect(containment.proseOverflow).toBeLessThanOrEqual(1);
    expect(containment.codeScrollsLocally).toBe(true);
    expect(containment.tableScrollsLocally).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("does not yank a scrolled-up reader and offers jump to latest for a growing live row", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`);
    const transcript = page.getByTestId("opencode-transcript");
    await expect.poll(() => transcript.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(2);
    await transcript.evaluate((element) => {
      element.scrollTop = 240;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const before = await transcript.evaluate((element) => element.scrollTop);

    await fetch(`${MOCK_URL}/test/mobile/grow`, { method: "POST" });
    await expect(transcript.getByText("New live activity from the running agent.")).toBeAttached();
    await expect(page.getByTestId("opencode-jump-to-latest")).toBeVisible();
    expect(await transcript.evaluate((element) => element.scrollTop)).toBeCloseTo(before, 0);

    await page.getByTestId("opencode-jump-to-latest").click();
    await expect.poll(() => transcript.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("opencode-jump-to-latest")).toHaveCount(0);
  });

  test("does not show Jump to latest merely because a scrolled-up run goes idle", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`);
    const transcript = page.getByTestId("opencode-transcript");
    await expect(page.getByText("running", { exact: true })).toBeVisible();
    await transcript.evaluate((element) => {
      element.scrollTop = 240;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(page.getByTestId("opencode-jump-to-latest")).toHaveCount(0);

    await fetch(`${MOCK_URL}/test/mobile/idle`, { method: "POST" });
    await expect(page.getByText("running", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("opencode-jump-to-latest")).toHaveCount(0);
  });

  test("stacks the Changes rail above the diff at phone width", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_mobile?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-mobile-session-menu").locator("summary").click();
    await page.getByTestId("opencode-mobile-workspace-open").click();
    await page.getByTestId("opencode-workspace-changes").click();
    const rail = page.getByTestId("opencode-changes-rail");
    const diff = page.getByTestId("opencode-diff-viewer");
    await expect(rail).toBeVisible();
    const [railBox, diffBox] = await Promise.all([rail.boundingBox(), diff.boundingBox()]);
    expect(diffBox?.y).toBeGreaterThanOrEqual((railBox?.y ?? 0) + (railBox?.height ?? 0) - 1);
    expect(railBox?.width).toBeCloseTo(diffBox?.width ?? 0, 0);
  });

  test("opens session todo, run log, reviews, and catalog in a dismissible mobile sheet", async ({ page }) => {
    await fetch(`${MOCK_URL}/test/catalog-requests`, { method: "POST" });
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-mobile-session-menu").locator("summary").click();
    await page.getByTestId("opencode-mobile-inspector-menu-open").click();
    const sheet = page.getByTestId("opencode-mobile-inspector");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("opencode-todo-list")).toContainText("Add the route");
    await sheet.getByTestId("opencode-inspector-runlog").click();
    await expect(sheet.getByTestId("opencode-command-list")).toBeVisible();
    await sheet.getByTestId("opencode-inspector-reviews").click();
    await expect(sheet.getByTestId("opencode-merge-request-list")).toBeVisible();
    expect(await (await fetch(`${MOCK_URL}/test/catalog-requests`)).json()).toEqual({ count: 0 });
    await sheet.getByTestId("opencode-inspector-catalog").click();
    await expect(sheet.getByTestId("opencode-catalog-mcp")).toContainText(/\d connected \/ 5 total/);
    await expect(sheet.getByTestId("opencode-catalog-mcp")).toContainText("needs client registration");
    await expect(sheet.getByTestId("opencode-catalog-skills")).toContainText("browser-check");
    await expect(sheet.getByTestId("opencode-catalog-commands")).toContainText("/verify");
    expect(await (await fetch(`${MOCK_URL}/test/catalog-requests`)).json()).toEqual({ count: 2 });
    await sheet.getByTestId("opencode-catalog-refresh").click();
    await expect.poll(async () => await (await fetch(`${MOCK_URL}/test/catalog-requests`)).json()).toEqual({ count: 4 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await sheet.getByTestId("opencode-mobile-inspector-close").click();
    await expect(sheet).toHaveCount(0);
    await page.getByTestId("opencode-mobile-session-menu").locator("summary").click();
    await page.getByTestId("opencode-mobile-inspector-menu-open").click();
    await expect(sheet).toBeVisible();
    expect(await (await fetch(`${MOCK_URL}/test/catalog-requests`)).json()).toEqual({ count: 4 });
    await page.goBack();
    await expect(sheet).toHaveCount(0);
  });
});

test.describe("question remote control", () => {
  test.beforeEach(async () => {
    await fetch(`${MOCK_URL}/test/questions/reset?scope=ui`, { method: "POST" });
  });

  test("renders every question and submits answers in order", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const request = page.getByTestId("opencode-question-request");
    await expect(request).toContainText("Where should this ship?");
    await expect(request).toContainText("Which checks should run?");
    await request.getByTestId("opencode-question-option").nth(0).check();
    await request.getByTestId("opencode-question-option").nth(2).check();
    await request.getByTestId("opencode-question-option").nth(3).check();
    await request.getByTestId("opencode-question-submit").click();
    await expect.poll(async () => {
      const replies = await (await fetch(`${MOCK_URL}/test/question-replies?id=que_mock`)).json() as unknown[];
      return replies;
    }).toEqual([{ id: "que_mock", answers: [["Staging"], ["Unit", "E2E"]] }]);
  });

  test("submits a custom multi-select answer", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const request = page.getByTestId("opencode-question-request");
    await request.getByTestId("opencode-question-option").nth(0).check();
    await request.getByTestId("opencode-question-option").nth(2).check();
    await request.getByTestId("opencode-question-custom").fill("Lint");
    await request.getByTestId("opencode-question-submit").click();
    await expect.poll(async () => await (await fetch(`${MOCK_URL}/test/question-replies?id=que_mock`)).json()).toEqual([
      { id: "que_mock", answers: [["Staging"], ["Unit", "Lint"]] },
    ]);
  });

  test("rejects a question", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-question-reject").click();
    await expect.poll(async () => await (await fetch(`${MOCK_URL}/test/question-replies?id=que_mock`)).json()).toEqual([
      { id: "que_mock", rejected: true },
    ]);
  });
});

test.describe("settings and tools UI", () => {
  test("edits compaction settings", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("opencode-setting-model").fill("anthropic/claude-opus-5");
    await page.getByTestId("opencode-compaction-auto").check();
    await page.getByTestId("opencode-compaction-reserved").fill("4096");
    await page.getByTestId("opencode-settings-save").click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("shows MCP failures, LSP status and permissions", async ({ page }) => {
    await page.goto(`/tools?directory=${encodeURIComponent(DIR)}`);
    await expect(page.getByTestId("opencode-mcp-row").filter({ hasText: "docs" })).toContainText(/connected|mock connection refused/);
    await expect(page.getByTestId("opencode-lsp-status")).toContainText("typescript");
    await expect(page.getByTestId("opencode-effective-permissions")).toContainText("allow");
  });

  test("keeps browser and ntfy event toggles independent", async ({ page }) => {
    await page.goto("/settings/notifications");
    const browser = page.getByTestId("opencode-notify-browser-idle");
    const ntfy = page.getByTestId("opencode-notify-ntfy-idle");
    const ntfyBefore = await ntfy.isChecked();
    await browser.click();
    expect(await ntfy.isChecked()).toBe(ntfyBefore);
  });

  test("badges unresolved notifications until the user checks them off", async ({ page }) => {
    const requestID = `perm_badge_${Date.now()}`;
    await fetch(`${MOCK_URL}/test/permission?directory=${encodeURIComponent(DIR)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: requestID, sessionID: "ses_mock_done", permission: "bash", patterns: ["npm test"] }),
    });

    await page.goto("/settings/notifications");
    const badge = page.getByTestId("opencode-nav-notifications-badge");
    await expect(badge).toBeVisible();
    // The count lives on the link label so it is announced, not just painted.
    await expect(page.getByTestId("opencode-nav-notifications")).toHaveAttribute("aria-label", /unresolved/);
    await page.setViewportSize({ width: 390, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);

    const row = page.getByTestId("opencode-notification-record").filter({ hasText: "OpenCode needs permission" }).first();
    await expect(row).toHaveAttribute("data-active", "true");
    await expect(row).toContainText("ntfy off");

    const resolved = row.getByTestId("opencode-notification-resolved");
    await expect(resolved).not.toBeChecked();
    const countBefore = Number(await badge.textContent());
    await resolved.check();
    if (countBefore > 1) await expect(badge).toHaveText(String(countBefore - 1));
    else await expect(badge).toBeHidden();

    await page.reload();
    await expect(row.getByTestId("opencode-notification-resolved")).toBeChecked();
    await row.getByTestId("opencode-notification-resolved").uncheck();
    await expect(badge).toHaveText(String(countBefore));
    await row.getByTestId("opencode-notification-resolved").check();

    await fetch(`${MOCK_URL}/test/permissions/reset?directory=${encodeURIComponent(DIR)}`, { method: "POST" });
  });
});

test.describe("workspace UI", () => {
  const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;

  test("opens files, changes, commands and preview", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-session-inspector")).toBeVisible();
    await expect(page.getByTestId("opencode-mobile-inspector-open")).toBeHidden();
    await page.getByTestId("opencode-inspector-runlog").click();
    await expect(page.getByTestId("opencode-command-row")).toHaveCount(3);
    await page.getByTestId("opencode-inspector-reviews").click();
    await expect(page.getByTestId("opencode-review-card")).toContainText("Mock pull request");
    await expect(page.getByTestId("opencode-review-card")).toContainText("checks passed");
    await page.getByTestId("opencode-review-details-toggle").click();
    await expect(page.getByTestId("opencode-review-details")).toContainText("Ready to ship.");
    await expect(page.getByTestId("opencode-review-comment")).toContainText("Looks good.");
    const failed = page.getByTestId("opencode-review-check").filter({ hasText: "test" });
    await expect(failed).toHaveAttribute("data-status", "failed");
    await expect(failed.getByRole("link")).toHaveAttribute("rel", "noreferrer");
    await page.getByTestId("opencode-workspace-open").click();
    await page.getByTestId("opencode-file-node").filter({ hasText: "README.md" }).click();
    await expect(page.getByTestId("opencode-file-viewer")).toContainText("Mock project");
    await page.getByTestId("opencode-workspace-changes").click();
    await expect(page.getByTestId("opencode-diff-viewer")).toContainText("+new");
    await page.getByTestId("opencode-workspace-preview").click();
    await expect(page.getByTestId("opencode-preview-frame")).toBeVisible();
  });

  test("fetches expensive review details only after expansion", async ({ page }) => {
    await fetch(`${FORGE_URL}/test/forge-reset`, { method: "POST" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(conversation);
    await page.getByTestId("opencode-inspector-reviews").click();
    await expect(page.getByTestId("opencode-review-card")).toContainText("Mock pull request");
    expect(await (await fetch(`${FORGE_URL}/test/forge-state`)).json()).toMatchObject({ detailRequests: 0 });
    await page.getByTestId("opencode-review-details-toggle").click();
    await expect(page.getByTestId("opencode-review-check")).toBeVisible();
    expect(await (await fetch(`${FORGE_URL}/test/forge-state`)).json()).toMatchObject({ detailRequests: 4 });
  });

  test("keeps merge confirmation bound to the reviewed SHA", async ({ page }) => {
    await fetch(`${FORGE_URL}/test/forge-reset`, { method: "POST" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(conversation);
    await page.getByTestId("opencode-inspector-reviews").click();
    await expect(page.getByTestId("opencode-merge-review")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("opencode-merge-review").click();
    await expect(page.getByTestId("opencode-review-card")).toHaveAttribute("data-state", "merged");
    await expect.poll(async () => (await (await fetch(`${FORGE_URL}/test/forge-state`)).json()).mergeBody).toEqual({ sha: "abc123" });
  });

  test("review card remains width-safe in a mobile cockpit host", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(conversation);
    await page.getByTestId("opencode-inspector-reviews").click();
    await expect(page.getByTestId("opencode-review-card")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 740 });
    await page.getByTestId("opencode-session-inspector").evaluate((element) => {
      element.style.display = "block";
      element.style.width = "390px";
      element.style.maxWidth = "100%";
    });
    const cardWidth = await page.getByTestId("opencode-review-card").evaluate((element) => element.getBoundingClientRect().width);
    expect(cardWidth).toBeLessThanOrEqual(390);
    const overflow = await page.getByTestId("opencode-review-card").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("workspace drawer fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(conversation);
    await page.getByTestId("opencode-mobile-session-menu").locator("summary").click();
    await page.getByTestId("opencode-mobile-workspace-open").click();
    await expect(page.getByTestId("opencode-workspace-panels")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
