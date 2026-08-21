import { describe, expect, it } from "vitest";

import { toSummary } from "../server/opencode/sessions.js";

describe("session summary share state", () => {
  it("exposes only a safe public share URL", () => {
    const summary = toSummary({
      id: "ses_1",
      directory: "/tmp/project",
      share: { url: "https://share.example/s/1" },
      secret: "must not escape",
    } as Parameters<typeof toSummary>[0], false);

    expect(summary.shareUrl).toBe("https://share.example/s/1");
    expect(summary).not.toHaveProperty("share");
    expect(summary).not.toHaveProperty("secret");
  });

  it.each([
    undefined,
    42,
    "javascript:alert(1)",
    "file:///tmp/session",
    "https://user:password@share.example/s/1",
    `https://share.example/${"x".repeat(2_100)}`,
  ])("omits an unsafe upstream share URL: %s", (url) => {
    const summary = toSummary({ share: { url } } as Parameters<typeof toSummary>[0], false);
    expect(summary.shareUrl).toBeUndefined();
  });
});
