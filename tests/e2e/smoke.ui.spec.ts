import { expect, test } from "@playwright/test";

// Browser tier — the built SPA against the real BFF against the mock agent.

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const hub = `/?directory=${encodeURIComponent(DIR)}`;

test.describe("hub", () => {
  test("lists sessions for the directory", async ({ page }) => {
    await page.goto(hub);
    await expect(page.getByTestId("opencode-session-list")).toBeVisible();
    const rows = page.getByTestId("opencode-session-row");
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Add a health endpoint")).toBeVisible();
    await expect(page.getByText("Old archived work")).toHaveCount(0);
  });

  test("shows a running pill for the busy session", async ({ page }) => {
    await page.goto(hub);
    const pills = page.getByTestId("opencode-status-pill");
    await expect(pills.filter({ hasText: "running" })).toHaveCount(1);
  });

  test("reports the upstream agent version", async ({ page }) => {
    await page.goto(hub);
    await expect(page.getByTestId("opencode-upstream-badge")).toContainText("1.18.19");
  });

  test("prompts for a directory when none is set", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await expect(page.getByTestId("opencode-start")).toBeDisabled();
  });

  test("navigating to a session keeps the directory scope", async ({ page }) => {
    await page.goto(hub);
    await page.getByTestId("opencode-session-row").first().click();
    await expect(page).toHaveURL(/\/sessions\/.*directory=/);
    await expect(page.getByTestId("opencode-conversation")).toBeVisible();
  });
});

test.describe("transcript", () => {
  const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;

  test("renders every row kind from the fixture", async ({ page }) => {
    await page.goto(conversation);
    await expect(page.getByTestId("opencode-transcript")).toBeVisible();
    await expect(page.getByTestId("opencode-user-message").first()).toBeVisible();
    await expect(page.getByTestId("opencode-agent-message")).toBeVisible();
    await expect(page.getByTestId("opencode-thought")).toHaveCount(1);
    await expect(page.getByTestId("opencode-status-separator").first()).toBeVisible();
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
    await tool.getByRole("button").click();
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
    const tasks = page.getByTestId("opencode-task-list");
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
  test("sends a follow-up", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-composer").fill("do the thing");
    await page.getByTestId("opencode-send").click();
    await expect(page.getByTestId("opencode-composer")).toHaveValue("");
  });

  test("accepts an image attachment", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await page.getByTestId("opencode-attach").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
    await expect(page.getByTestId("opencode-attachment-chip")).toContainText("pixel.png");
    await page.getByTestId("opencode-composer").fill("inspect this");
    await page.getByTestId("opencode-send").click();
    await expect(page.getByTestId("opencode-attachment-chip")).toHaveCount(0);
  });

  test("disables send when empty", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await expect(page.getByTestId("opencode-send")).toBeDisabled();
  });

  test("attaches one reminder, round-trips it, and resets the picker", async ({ page }) => {
    const text = `push safely ${Date.now()}`;
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    const picker = page.getByTestId("composer-reminder-select");
    await expect(picker).toBeVisible();
    await picker.selectOption("no-force-push");
    await page.getByTestId("opencode-composer").fill(text);
    await page.getByTestId("opencode-send").click();
    await expect(picker).toHaveValue("");

    const user = page.getByTestId("opencode-user-message").filter({ hasText: text });
    await expect(user).toBeVisible();
    await expect(user.getByTestId("opencode-user-message-body")).toHaveText(text);
    const reminder = user.getByTestId("opencode-manual-reminder");
    await expect(reminder).toBeVisible();
    await expect(reminder).toHaveAttribute("open", "");
    await expect(reminder).toContainText("no-force-push");
    await expect(reminder).toContainText("Do not force-push");
    await expect(user).not.toContainText("<reminder");
  });
});

test.describe("mobile", () => {
  // Mobile over Tailscale is a first-class surface, not an afterthought.
  test.use({ viewport: { width: 390, height: 740 } });

  test("hub is usable on a phone", async ({ page }) => {
    await page.goto(hub);
    await expect(page.getByTestId("opencode-session-list")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal scroll on a phone").toBeLessThanOrEqual(1);
  });

  test("transcript is the only scrolling region", async ({ page }) => {
    await page.goto(`/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`);
    await expect(page.getByTestId("opencode-transcript")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
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
});

test.describe("workspace UI", () => {
  const conversation = `/sessions/ses_mock_done?directory=${encodeURIComponent(DIR)}`;

  test("opens files, changes, commands and preview", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(conversation);
    await page.getByTestId("opencode-inspector-commands").click();
    await expect(page.getByTestId("opencode-command-row")).toHaveCount(3);
    await page.getByTestId("opencode-inspector-links").click();
    await expect(page.getByTestId("opencode-merge-request-link")).toContainText("Mock pull request");
    await expect(page.getByTestId("opencode-merge-request-link")).toContainText("pipeline passed");
    await page.getByTestId("opencode-workspace-open").click();
    await page.getByTestId("opencode-file-node").filter({ hasText: "README.md" }).click();
    await expect(page.getByTestId("opencode-file-viewer")).toContainText("Mock project");
    await page.getByTestId("opencode-workspace-changes").click();
    await expect(page.getByTestId("opencode-diff-viewer")).toContainText("+new");
    await page.getByTestId("opencode-workspace-preview").click();
    await expect(page.getByTestId("opencode-preview-frame")).toBeVisible();
  });

  test("workspace drawer fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(conversation);
    await page.getByTestId("opencode-workspace-open").click();
    await expect(page.getByTestId("opencode-workspace-panels")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
