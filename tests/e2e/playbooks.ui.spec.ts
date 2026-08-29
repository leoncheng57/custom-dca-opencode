import { expect, test } from "@playwright/test";

// The mock canonicalizes its fixture directory, so macOS needs the /private
// spelling or the catalogue resolves to a different project.
const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";

test.describe("Playbooks", () => {
  test("is first-class navigation on the bar beside Planning", async ({ page }) => {
    await page.goto("/");
    // Promoted out of the More menu onto the bar itself.
    await page.locator("nav[aria-label='Main']").getByTestId("opencode-nav-playbooks").click();

    await expect(page).toHaveURL("/playbooks");
    await expect(page).toHaveTitle("Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbooks-wip-warning")).toHaveText("Playbooks is still work in progress and its UI/UX may contain bugs.");
    await expect(page.getByRole("heading", { name: "Repeatable ways to work with an agent." })).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-skill-card")).toHaveCount(15);
    await expect(page.getByTestId("opencode-playbook-command-card")).toHaveCount(17);
  });

  test("distinguishes model-selected skills from human-invoked commands", async ({ page }) => {
    await page.goto("/playbooks");
    // The distinction is the load-bearing fact on this page, so it must be on
    // the card itself rather than only in the hero prose.
    const skill = page.getByTestId("opencode-playbook-skill-card").first();
    const command = page.getByTestId("opencode-playbook-command-card").first();
    await expect(skill).toContainText("model-selected");
    await expect(command).toContainText("human-invoked");
    await expect(skill).toHaveAttribute("data-playbook-kind", "skill");
    await expect(command).toHaveAttribute("data-playbook-kind", "command");
    // Colour, not just wording: the two chips must not render identically.
    const chipColour = (root: typeof skill) => root.locator("span").first().evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(await chipColour(skill)).not.toBe(await chipColour(command));
  });

  test("filters by tag and opens a skill with simulation and installation", async ({ page }) => {
    await page.goto("/playbooks/skills");
    await page.getByTestId("opencode-playbook-filter").fill("critique");
    await expect(page.getByTestId("opencode-playbook-skill-card")).toHaveCount(2);

    await page.getByTestId("opencode-playbook-skill-grill-me").click();
    await expect(page).toHaveURL("/playbooks/skills/grill-me");
    await expect(page).toHaveTitle("Skill | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-dialog")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-dialog").getByTestId("opencode-playbooks-wip-warning")).toHaveText("Playbooks is still work in progress and its UI/UX may contain bugs.");
    await expect(page.getByTestId("opencode-playbooks")).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-simulation")).toBeVisible();
    await page.getByText("Install grill-me", { exact: true }).click();
    await expect(page.getByText("npx skills add", { exact: false }).first()).toBeVisible();
  });

  test("closes a direct detail URL back to the all-playbooks catalogue", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/playbooks/skills/ascii-diagrams");
    const dialog = page.getByTestId("opencode-playbook-dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box!.x + box!.width / 2) - 640)).toBeLessThanOrEqual(2);
    expect(Math.abs((box!.y + box!.height / 2) - 400)).toBeLessThanOrEqual(2);
    await dialog.getByRole("button", { name: "Close playbook" }).click();
    await expect(page).toHaveURL("/playbooks");
    await expect(dialog).toHaveCount(0);
  });

  test("dismisses with Escape and with a backdrop click", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/playbooks/skills/ascii-diagrams");
    const dialog = page.getByTestId("opencode-playbook-dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/playbooks");
    await expect(dialog).toHaveCount(0);

    await page.goto("/playbooks/skills/ascii-diagrams");
    await expect(dialog).toBeVisible();
    // Click the ::backdrop region, which is the dialog element itself.
    await page.mouse.click(6, 6);
    await expect(page).toHaveURL("/playbooks");
    await expect(dialog).toHaveCount(0);
  });

  test("keeps focus in the document after the modal closes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/playbooks/skills/ascii-diagrams");
    const dialog = page.getByTestId("opencode-playbook-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("opencode-playbook-close")).toBeFocused();
    await dialog.getByTestId("opencode-playbook-close").click();
    await expect(dialog).toHaveCount(0);
    // Closing unmounts the card link that opened the modal, so restoring focus
    // to it is a silent no-op. Focus must land on the catalogue, not <body>.
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  });

  test("puts simulation controls above the transcript and locks background scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/playbooks/skills/grill-me");
    const simulation = page.getByTestId("opencode-playbook-simulation");
    await expect(simulation).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");

    const controls = simulation.getByTestId("opencode-playbook-simulation-controls");
    const transcript = simulation.locator("ol").first();
    const [controlsBox, transcriptBox] = await Promise.all([controls.boundingBox(), transcript.boundingBox()]);
    expect(controlsBox!.y, "controls sit above the transcript they drive").toBeLessThan(transcriptBox!.y);

    // The progress bar is always mounted, so play/pause cannot shift layout.
    await expect(simulation.getByTestId("opencode-playbook-simulation-progress")).toBeAttached();
    await simulation.getByTestId("opencode-playbook-simulation-reset").click();
    await expect(simulation.getByTestId("opencode-playbook-simulation-status")).toContainText("frame 1 of");
    await expect(simulation.getByTestId("opencode-playbook-simulation-reset")).toBeDisabled();
    await simulation.getByTestId("opencode-playbook-simulation-next").click();
    await expect(simulation.getByTestId("opencode-playbook-simulation-status")).toContainText("frame 2 of");
  });

  test("names the project when reporting load state, and claims nothing without one", async ({ page }) => {
    // No project selected yet: the page must make no installation claim at all
    // rather than implying "not installed".
    await page.goto("/playbooks");
    await page.evaluate(() => localStorage.removeItem("opencode.directory.v1"));
    await page.reload();
    await expect(page.getByTestId("opencode-playbook-skill-card").first()).toBeVisible();
    await expect(page.getByTestId("opencode-playbook-skill-load-state")).toHaveCount(0);

    // With a project, every claim carries the project name — installation is
    // per-directory while this page is global.
    await page.goto(`/playbooks?directory=${encodeURIComponent(DIR)}`);
    const state = page.getByTestId("opencode-playbook-skill-load-state").first();
    await expect(state).toBeVisible();
    await expect(state).toContainText("mock-project");
    await expect(state).toHaveAttribute("data-installed", /true|false/);

    // The mock server reports one loaded skill, so both states are represented.
    const loaded = page.locator('[data-testid="opencode-playbook-skill-load-state"][data-installed="true"]');
    const notLoaded = page.locator('[data-testid="opencode-playbook-skill-load-state"][data-installed="false"]');
    expect(await loaded.count() + await notLoaded.count()).toBeGreaterThan(0);
  });

  test("says plainly that viewing or copying installs nothing", async ({ page }) => {
    await page.goto("/playbooks/skills/grill-me");
    await expect(page.getByTestId("opencode-playbook-scope-note")).toContainText("does not install anything");
    await expect(page.getByTestId("opencode-playbook-scope-note")).toContainText("does not attach anything to a conversation");

    // The install disclosure must not imply the app performs the install.
    await page.getByText("Install grill-me", { exact: true }).click();
    await expect(page.getByTestId("opencode-playbook-install-note")).toContainText("does not install anything");

    // Source links name the revision they follow rather than implying a pin.
    await expect(page.getByTestId("opencode-playbook-source-link")).toContainText("main");
  });

  test("keeps terminal inline code legible in light mode", async ({ page }) => {
    // The terminal keeps its dark surface in both themes, but the shared inline
    // code rule follows the theme — in light mode that painted a near-white
    // block on the dark panel and hid the text entirely.
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/playbooks/skills/grill-me");
    const code = page.getByTestId("opencode-playbook-simulation").locator("code").first();
    await expect(code).toBeVisible();
    const { background, colour } = await code.evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
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

  test("states the caveat exactly once", async ({ page }) => {
    await page.goto("/playbooks/skills/grill-me");
    await expect(page.getByTestId("opencode-playbook-dialog")).toBeVisible();
    await expect(page.getByText("Caveat:", { exact: false })).toHaveCount(1);
    await expect(page.getByText("Simulation disclosure")).toHaveCount(0);
  });

  test("shows command relationships and remains usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto("/playbooks/commands/verify");

    await expect(page).toHaveTitle("Command | Playbooks | DCA");
    await expect(page.getByTestId("opencode-playbook-dialog").getByRole("heading", { name: "/verify <arguments>" })).toBeVisible();
    await expect(page.getByRole("link", { name: "human-verification-steps" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Full-screen on a phone, not a centred card with unreachable backdrop.
    const box = await page.getByTestId("opencode-playbook-dialog").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(389);
    expect(box!.height).toBeGreaterThanOrEqual(739);
  });
});
