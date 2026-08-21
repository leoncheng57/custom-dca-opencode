import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { resolveCaptureConfig, VIEWPORT, type ScreenshotRequest } from "../../scripts/pr-screenshots.js";

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
      await page.setViewportSize(VIEWPORT);
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("theme", "light"));
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
              : "opencode-hub";
      await expect(page.getByTestId(stableRoot)).toBeVisible();
      await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
      await page.evaluate(async () => await document.fonts.ready);
      await expect(page.getByTestId("opencode-error")).toHaveCount(0);
      await page.screenshot({ path: path.join(config.outputDir, request.filename), fullPage: request.fullPage });
    });
  }
});
