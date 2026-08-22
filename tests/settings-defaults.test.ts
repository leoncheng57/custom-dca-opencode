import { describe, expect, it } from "vitest";

import {
  booleanFromOverride,
  booleanOverride,
  OPENCODE_SETTINGS_DEFAULTS,
  writableSettings,
} from "../client/lib/settingsDefaults.js";

describe("settings defaults", () => {
  it("matches the pinned OpenCode config schema", () => {
    expect(OPENCODE_SETTINGS_DEFAULTS).toEqual({
      subagentDepth: 1,
      compactionAuto: true,
      compactionPrune: false,
    });
  });

  it("keeps an inherited boolean distinct from explicit on and off", () => {
    expect(booleanOverride(undefined)).toBe("default");
    expect(booleanOverride(true)).toBe("on");
    expect(booleanOverride(false)).toBe("off");
    expect(booleanFromOverride("default")).toBeUndefined();
    expect(booleanFromOverride("on")).toBe(true);
    expect(booleanFromOverride("off")).toBe(false);
  });

  it("never sends the read-only global subagent depth in a PATCH", () => {
    expect(writableSettings({
      model: "anthropic/opus",
      subagent_depth: 3,
      compaction: { auto: false },
    })).toEqual({ model: "anthropic/opus", compaction: { auto: false } });
  });
});
