import { expect, test } from "@playwright/test";

const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;

async function installMediaStubs(page: import("@playwright/test").Page, stored?: string) {
  await page.addInitScript(({ stored }) => {
    if (stored !== undefined) localStorage.setItem("opencode-notification-media-v1", stored);
    const calls = { frequencies: [] as number[], starts: 0, resumes: 0, speech: [] as string[], cancels: 0 };
    Object.defineProperty(window, "__mediaCalls", { value: calls, configurable: true });
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      state: AudioContextState = "suspended";
      resume() { calls.resumes += 1; this.state = "running"; return Promise.resolve(); }
      createOscillator() {
        const frequency = { value: 0 };
        return {
          frequency,
          type: "sine",
          connect() { return this; },
          start() { calls.starts += 1; calls.frequencies.push(frequency.value); },
          stop() {},
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() { return this; },
        };
      }
    }
    class FakeUtterance {
      rate = 1;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() { calls.cancels += 1; },
        speak(utterance: FakeUtterance) { calls.speech.push(utterance.text); },
      },
      configurable: true,
    });
  }, { stored });
}

test.describe("notification sound and speech", () => {
  test("disabled media makes no calls and previews unlock after a click", async ({ page }) => {
    await installMediaStubs(page);
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("opencode-browser-sound")).not.toBeChecked();
    await expect(page.getByTestId("opencode-speech-enabled")).not.toBeChecked();

    await fetch(`${MOCK_URL}/test/mobile/idle`, { method: "POST" });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as unknown as { __mediaCalls: { starts: number; speech: string[] } }).__mediaCalls)).toMatchObject({ starts: 0, speech: [] });

    await page.getByTestId("opencode-preview-sound").click();
    await page.getByTestId("opencode-preview-speech").click();
    const calls = await page.evaluate(() => (window as unknown as { __mediaCalls: { starts: number; resumes: number; speech: string[] } }).__mediaCalls);
    expect(calls.resumes).toBe(1);
    expect(calls.starts).toBeGreaterThan(0);
    expect(calls.speech).toEqual(["Session finished"]);
  });

  test("event kinds use distinct tones and safe phrases after saving", async ({ page }) => {
    await installMediaStubs(page);
    await page.goto("/settings/notifications");
    await page.getByTestId("opencode-browser-sound").check();
    await page.getByTestId("opencode-speech-enabled").check();
    await page.getByTestId("opencode-notifications-save").click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.evaluate(() => {
      const calls = (window as unknown as { __mediaCalls: { frequencies: number[]; starts: number; speech: string[] } }).__mediaCalls;
      calls.frequencies.length = 0;
      calls.starts = 0;
      calls.speech.length = 0;
    });
    await fetch(`${MOCK_URL}/test/mobile/idle`, { method: "POST" });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaCalls: { speech: string[] } }).__mediaCalls.speech)).toContain("Session finished");
    const idleFrequencies = await page.evaluate(() => (window as unknown as { __mediaCalls: { frequencies: number[] } }).__mediaCalls.frequencies.splice(0));

    await fetch(`${MOCK_URL}/test/permission?directory=/tmp/mock-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: `per_media_${Date.now()}`, sessionID: "ses_mock_done", permission: "bash", patterns: ["private command"] }),
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaCalls: { speech: string[] } }).__mediaCalls.speech)).toContain("OpenCode needs permission");
    const permissionFrequencies = await page.evaluate(() => (window as unknown as { __mediaCalls: { frequencies: number[] } }).__mediaCalls.frequencies);
    expect(idleFrequencies).not.toEqual(permissionFrequencies);
    expect(await page.evaluate(() => (window as unknown as { __mediaCalls: { speech: string[] } }).__mediaCalls.speech)).toEqual([
      "Session finished",
      "OpenCode needs permission",
    ]);
  });

  test("corrupt storage resets and the controls fit at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await installMediaStubs(page, "{bad-json");
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("opencode-sound-profile")).toHaveValue("distinct");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("opencode-notification-media-v1") ?? "null").version)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
