import { describe, expect, it } from "vitest";

import { latestModeMessageID, modeFromMessages, modeFromSession } from "../client/lib/agentMode.js";

describe("modeFromMessages", () => {
  it("does not invent Build when no persisted agent exists", () => {
    expect(modeFromMessages([])).toBeUndefined();
    expect(modeFromMessages([{ info: { id: "one", role: "user" } }])).toBeUndefined();
  });

  it("uses the latest persisted user message", () => {
    const messages = [
      { info: { id: "one", role: "user", agent: "build" } },
      { info: { id: "ignored", role: "system", agent: "build" } },
      { info: { id: "two", role: "user", agent: "plan" } },
    ];
    expect(modeFromMessages(messages)).toBe("plan");
    expect(latestModeMessageID(messages)).toBe("two");
  });

  it("uses session metadata for a new explicit Plan or Build session", () => {
    expect(modeFromSession("plan", [])).toBe("plan");
    expect(modeFromSession("build", [])).toBe("build");
  });

  it("does not mislabel a foreign agent even after a Plan or Build message", () => {
    expect(modeFromSession("explore", [
      { info: { id: "one", role: "user", agent: "build" } },
    ])).toBeUndefined();
    expect(modeFromSession("sisyphus", [
      { info: { id: "one", role: "user", agent: "sisyphus" } },
      { info: { id: "two", role: "user", agent: "plan" } },
    ])).toBeUndefined();
  });

  it("uses the newest user-selected agent after an explicit upstream switch", () => {
    expect(modeFromMessages([
      { info: { id: "one", role: "user", agent: "explore" } },
      { info: { id: "two", role: "user", agent: "build" } },
    ])).toBe("build");
  });

  it.each(["plan", "build"] as const)("ignores automatic compaction after %s", (mode) => {
    const messages = [
      { info: { id: "selected", role: "user", agent: mode } },
      { info: { id: "compact", role: "user", agent: mode }, parts: [{ type: "compaction", auto: true }] },
      { info: { id: "summary", role: "assistant", agent: "compaction" } },
    ];
    expect(modeFromSession(mode, messages)).toBe(mode);
    expect(latestModeMessageID(messages)).toBe("compact");
  });
});
