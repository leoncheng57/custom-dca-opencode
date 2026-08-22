import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { resolveCaptureConfig, SCREENSHOT_VIEWPORTS, VIEWPORTS, type ScreenshotRequest } from "../../scripts/pr-screenshots.js";

const config = resolveCaptureConfig(process.env, process.env.PR_SCREENSHOT_CAPTURE_REQUIRED === "true");
const requests = config
  ? JSON.parse(readFileSync(config.requestFile, "utf8")) as ScreenshotRequest[]
  : [];

test.describe("requested PR screenshots", () => {
  if (!config) {
    test.skip("@shots requires the screenshot runner", () => {});
    return;
  }
  for (const request of requests) {
    test(`${request.requestedRoute} @shots`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("theme", "dark"));
      for (const viewport of SCREENSHOT_VIEWPORTS) {
        await page.setViewportSize(VIEWPORTS[viewport]);
        const response = await page.goto(request.requestedRoute, { waitUntil: "domcontentloaded" });
        expect(response?.ok(), `route ${request.requestedRoute} should load`).toBe(true);

        const pathname = new URL(request.requestedRoute, "http://screenshot.invalid").pathname;
        const stableRoot = pathname.startsWith("/sessions/")
          ? "opencode-conversation"
          : pathname === "/settings/notifications"
            ? "opencode-notifications"
            : pathname === "/settings"
              ? "opencode-settings"
              : pathname === "/tools"
                ? "opencode-tools"
                : pathname === "/docs"
                  ? "opencode-docs"
                  : pathname.startsWith("/docs/")
                    ? "opencode-doc"
                    : "opencode-hub";
        await expect(page.getByTestId(stableRoot)).toBeVisible();
        const url = new URL(request.requestedRoute, "http://screenshot.invalid");
        if (url.searchParams.get("panel") === "agents") {
          await expect(page.locator('[data-testid="opencode-subagents"]:visible')).toBeVisible();
          await expect(page.locator('[data-testid="opencode-subagent-row"]:visible')).toHaveCount(6);
        }
        if (pathname === "/settings") {
          await expect(page.getByTestId("opencode-setting-subagent-depth")).toBeVisible();
        }
        await expect(page.locator("html")).toHaveClass(/dark/);
        await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
        await page.evaluate(async () => await document.fonts.ready);
        await expect(page.getByTestId("opencode-error")).toHaveCount(0);
        await page.screenshot({ path: path.join(config.outputDir, request.filenames[viewport]), fullPage: request.fullPage });
      }
    });
  }
});
