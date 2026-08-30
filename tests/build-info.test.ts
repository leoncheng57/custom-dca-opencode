import { describe, expect, it } from "vitest";

import { formatBuildLabel } from "../client/lib/buildInfo.js";

describe("formatBuildLabel", () => {
  it("includes the deployed commit when available", () => {
    expect(formatBuildLabel("1.2.3", "abcdef0")).toBe("v1.2.3+abcdef0");
  });

  it("falls back to the semantic version when git metadata is unavailable", () => {
    expect(formatBuildLabel("1.2.3", "")).toBe("v1.2.3");
  });
});
