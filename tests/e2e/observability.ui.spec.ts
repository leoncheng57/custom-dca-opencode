import { expect, test } from "@playwright/test";

// Read-only throughout. This page describes the host, takes no ?directory=,
// and mutates nothing, so this file owns no shared state and needs no reset
// (see tests/e2e-shared-state-ownership.test.ts for why that matters).

test.describe("observability page", () => {
  test("is reachable from the More menu and renders the audit view", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("opencode-nav-more").click();
    const link = page.getByTestId("opencode-nav-observability");
    await expect(link).toBeVisible();
    await expect(link).toHaveRole("link");
    await link.click();

    await expect(page).toHaveURL(/\/observability/u);
    await expect(page.getByTestId("opencode-observability")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observability" })).toBeVisible();
    // Host-scoped: the link must not have acquired a directory query.
    expect(new URL(page.url()).searchParams.get("directory")).toBeNull();
  });

  test("switches log sources through the URL so a view is linkable", async ({ page }) => {
    await page.goto("/observability");
    await expect(page.getByTestId("opencode-observability-source-audit")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("opencode-observability-source-stderr").click();
    await expect(page).toHaveURL(/source=stderr/u);
    await expect(page.getByTestId("opencode-observability-source-stderr")).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.getByTestId("opencode-observability-source-stderr")).toHaveAttribute("aria-pressed", "true");
  });

  test("renders audit lines as structured rows and plain lines as text", async ({ page }) => {
    await page.goto("/observability?source=audit");
    const auditRows = page.locator('[data-testid="opencode-observability-row"][data-kind="audit"]');
    await expect(auditRows.first()).toBeVisible();

    await page.getByTestId("opencode-observability-source-stdout").click();
    const textRows = page.locator('[data-testid="opencode-observability-row"][data-kind="text"]');
    await expect(textRows.first()).toBeVisible();
  });

  test("follow mode is an explicit toggle, off by default", async ({ page }) => {
    await page.goto("/observability");
    const follow = page.getByTestId("opencode-observability-follow");
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await follow.click();
    await expect(follow).toHaveAttribute("aria-pressed", "true");
    await follow.click();
    await expect(follow).toHaveAttribute("aria-pressed", "false");
  });

  test("deployment tab reports processes, restart cost and served assets", async ({ page }) => {
    await page.goto("/observability?tab=deployment");
    await expect(page.getByTestId("opencode-observability-deployment")).toBeVisible();

    const services = page.getByTestId("opencode-observability-service");
    await expect(services.first()).toBeVisible();
    // The asymmetry is the point of the panel: restarting the two is not
    // equally cheap, and the page has to say so.
    await expect(page.getByText("restart: safe").first()).toBeVisible();
    await expect(page.getByText("restart: destructive").first()).toBeVisible();

    await expect(page.getByTestId("opencode-observability-asset").first()).toBeVisible();
    await expect(page.getByTestId("opencode-observability-busy")).toBeVisible();
  });

  test("fits a 390px viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto("/observability");
    await expect(page.getByTestId("opencode-observability")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
