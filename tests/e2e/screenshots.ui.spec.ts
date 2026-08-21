import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { VIEWPORT, type ScreenshotRequest } from "../../scripts/pr-screenshots.js";

const requestFile = process.env.PR_SCREENSHOT_REQUEST_FILE;
const outputDir = process.env.PR_SCREENSHOT_OUTPUT_DIR;
if (!requestFile || !outputDir) throw new Error("run screenshots through npm run screenshots");
const requests = JSON.parse(readFileSync(requestFile, "utf8")) as ScreenshotRequest[];

test.describe("requested PR screenshots", () => {
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
      await page.screenshot({ path: path.join(outputDir, request.filename), fullPage: request.fullPage });
    });
  }
});
