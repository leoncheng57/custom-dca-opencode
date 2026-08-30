import { expect, test } from "@playwright/test";

// A stable workflow to use as the modal fixture. These tests are about the
// dialog — focus, scroll lock, dismissal, light mode, phone width — and used to
// open a command detail page to get one. The command catalogue is retired, so
// they open a workflow detail page instead; the behaviour under test is the
// same modal component.
const FIXTURE = "/playbooks/workflows/system-design-artifacts";

test.describe("Playbooks", () => {
  test("is reachable from More without competing for navbar space", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("opencode-nav-more").click();
    await page.getByTestId("opencode-nav-more-menu").getByTestId("opencode-nav-playbooks").click();

    await expect(page).toHaveURL("/playbooks");
    await expect(page).toHaveTitle("Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbooks-wip-warning")).toHaveText("Playbooks is still work in progress and its UI/UX may contain bugs.");
    await expect(page.getByRole("heading", { name: "Repeatable work, invoked on purpose." })).toBeVisible();
    // Workflows are the live server category, so this count is the workflow
    // catalogue's own contract. It is deliberately exact: the retired command
    // inventory used to be derived from disk, but this one has to match what
    // the server actually served.
    await expect(page.getByTestId("opencode-playbook-workflow-card")).toHaveCount(14);
    await expect(page.getByTestId("opencode-playbook-workflow-goal")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-workflow-system-design-artifacts")).toBeVisible();
  });

  test("presents workflows as guided actions with zero at-rest context", async ({ page }) => {
    await page.goto("/playbooks");
    const workflow = page.getByTestId("opencode-playbook-workflow-card").first();
    await expect(workflow).toContainText("guided action");
    await expect(workflow).toHaveAttribute("data-playbook-kind", "workflow");
    await expect(page.getByText("At-rest tokens")).toBeVisible();
  });

  test("filters workflows and opens one with its argument and exact injector", async ({ page }) => {
    await page.goto("/playbooks/workflows");
    await page.getByTestId("opencode-playbook-filter").fill("standup update");
    await expect(page.getByTestId("opencode-playbook-workflow-card")).toHaveCount(1);

    await page.getByTestId("opencode-playbook-workflow-standup").click();
    await expect(page).toHaveURL("/playbooks/workflows/standup");
    await expect(page).toHaveTitle("Workflow | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-dialog")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-dialog").getByTestId("opencode-playbooks-wip-warning")).toHaveText("Playbooks is still work in progress and its UI/UX may contain bugs.");
    await expect(page.getByTestId("opencode-playbooks")).toBeVisible();
    // What it collects is part of reading it.
    await expect(page.getByTestId("opencode-playbook-workflow-input")).toContainText("Scope");
    await expect(page.getByTestId("opencode-playbook-workflow-input")).toContainText("becomes the prompt");
    // The three shell interpolations the retired command relied on have no
    // workflow equivalent, so the injector must tell the agent to run them.
    await expect(page.getByTestId("opencode-playbook-workflow-injector")).toContainText("Nothing is pre-fetched for you");
  });

  test("renders live workflows by shared semantic group and shows the exact injector", async ({ page }) => {
    await page.goto("/playbooks/workflows");
    await expect(page).toHaveTitle("Workflows | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-workflow-group")).toHaveCount(5);
    await expect(page.getByTestId("opencode-playbook-workflow-card")).toHaveCount(14);
    await page.getByTestId("opencode-playbook-workflow-start-dca-session").click();
    await expect(page).toHaveTitle("Workflow | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-workflow-injector")).toContainText("independent root session");
  });

  test("keeps workflow loading, failure, empty, and not-found states honest", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/workflows", async (route) => { await held; await route.fulfill({ json: { workflows: [] } }); });
    await page.goto("/playbooks/workflows/missing");
    await expect(page.getByTestId("opencode-playbook-workflow-loading")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-workflow-not-found")).toHaveCount(0);
    release();
    await expect(page.getByTestId("opencode-playbook-workflow-not-found")).toBeVisible();

    await page.unroute("**/api/workflows");
    await page.route("**/api/workflows", (route) => route.abort());
    await page.goto("/playbooks/workflows/missing");
    await expect(page.getByTestId("opencode-playbook-workflow-error")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-workflow-not-found")).toHaveCount(0);
    await page.goto("/playbooks");
    // With commands gone the catalogue has nothing to fall back to, so the
    // failure must be stated rather than leaving an empty page.
    await expect(page.getByTestId("opencode-playbook-workflows-error")).toBeVisible();

    await page.unroute("**/api/workflows");
    await page.route("**/api/workflows", (route) => route.fulfill({ json: { workflows: [] } }));
    await page.goto("/playbooks/workflows");
    await expect(page.getByTestId("opencode-playbook-workflows-empty")).toBeVisible();
  });

  test("puts unknown live workflows in Other and never asks for a project catalogue", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await page.route("**/api/workflows", (route) => route.fulfill({ json: { workflows: [{ id: "future-action", title: "Future action", description: "Arrived from the server.", injector: "Use the future procedure exactly." }] } }));
    await page.goto("/playbooks/workflows");
    const group = page.getByTestId("opencode-playbook-workflow-group");
    await expect(group).toHaveAccessibleName("Other");
    await expect(group).toContainText("Future action");
    // Playbooks reports a repository-owned, server-supplied catalogue. It has
    // no per-project installation question left to ask.
    expect(requests).not.toContain("/api/catalog");
  });

  test("closes a direct detail URL back to the workflow catalogue", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(FIXTURE);
    const dialog = page.getByTestId("opencode-playbook-dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box!.x + box!.width / 2) - 640)).toBeLessThanOrEqual(2);
    expect(Math.abs((box!.y + box!.height / 2) - 400)).toBeLessThanOrEqual(2);
    await dialog.getByRole("button", { name: "Close playbook" }).click();
    await expect(page).toHaveURL("/playbooks/workflows");
    await expect(dialog).toHaveCount(0);
  });

  test("dismisses with Escape and with a backdrop click", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(FIXTURE);
    const dialog = page.getByTestId("opencode-playbook-dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/playbooks/workflows");
    await expect(dialog).toHaveCount(0);

    await page.goto(FIXTURE);
    await expect(dialog).toBeVisible();
    // Click the ::backdrop region, which is the dialog element itself.
    await page.mouse.click(6, 6);
    await expect(page).toHaveURL("/playbooks/workflows");
    await expect(dialog).toHaveCount(0);
  });

  test("keeps focus in the document after the modal closes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(FIXTURE);
    const dialog = page.getByTestId("opencode-playbook-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("opencode-playbook-close")).toBeFocused();
    await dialog.getByTestId("opencode-playbook-close").click();
    await expect(dialog).toHaveCount(0);
    // Closing unmounts the card link that opened the modal, so restoring focus
    // to it is a silent no-op. Focus must land on the catalogue, not <body>.
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  });

  test("locks background scroll while the modal is open and restores it after", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(FIXTURE);
    await expect(page.getByTestId("opencode-playbook-dialog")).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
    await page.getByTestId("opencode-playbook-close").click();
    await expect(page.getByTestId("opencode-playbook-dialog")).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  });

  test("says plainly that viewing or copying runs nothing, and names the mode risk", async ({ page }) => {
    await page.goto(FIXTURE);
    const note = page.getByTestId("opencode-playbook-scope-note");
    await expect(note).toContainText("does not run, attach, or install anything");
    // A workflow has no `agent:` frontmatter to pin its mode, unlike the
    // command it replaced. The page has to say so rather than let a reader
    // assume the old guarantee survived.
    await expect(note).toContainText("current mode");
  });

  test("keeps the injector's code legible in light mode", async ({ page }) => {
    // The injector panel keeps its dark surface in both themes, but the shared
    // inline code rule follows the theme — in light mode that painted a
    // near-white block on the dark panel and hid the text entirely.
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(FIXTURE);
    const code = page.getByTestId("opencode-playbook-workflow-injector").locator("code").first();
    await expect(code).toBeVisible();
    const { background, colour } = await code.evaluate((node) => ({
      background: getComputedStyle(node.parentElement ?? node).backgroundColor,
      colour: getComputedStyle(node).color,
    }));
    const luminance = (value: string) => {
      const [r, g, b] = value.match(/[\d.]+/gu)!.slice(0, 3).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Text and its background must not both be light; on the dark panel the
    // code text is light, so the background has to stay dark.
    expect(Math.abs(luminance(background) - luminance(colour))).toBeGreaterThan(60);
  });

  test("shows the complete workflow procedure and remains usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(FIXTURE);

    await expect(page).toHaveTitle("Workflow | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-dialog").getByRole("heading", { name: "Build a system-design review package" })).toBeVisible();
    // The full ported procedure is present, tables and all.
    await expect(page.getByTestId("opencode-playbook-dialog")).toContainText("Evidence is absent, contradictory, inaccessible, or intentionally unprobed");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Full-screen on a phone, not a centred card with unreachable backdrop.
    const box = await page.getByTestId("opencode-playbook-dialog").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(389);
    expect(box!.height).toBeGreaterThanOrEqual(739);
  });
});
