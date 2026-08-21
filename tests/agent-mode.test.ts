import { describe, expect, it } from "vitest";

import { latestModeMessageID, modeFromMessages, modeFromSession } from "../client/lib/agentMode.js";

describe("modeFromMessages", () => {
  it("does not invent Build when no persisted agent exists", () => {
    expect(modeFromMessages([])).toBeUndefined();
    expect(modeFromMessages([{ info: { id: "one", role: "user" } }])).toBeUndefined();
  });

  it("uses the latest persisted user or assistant message", () => {
    const messages = [
      { info: { id: "one", role: "user", agent: "build" } },
      { info: { id: "ignored", role: "system", agent: "build" } },
      { info: { id: "two", role: "assistant", agent: "plan" } },
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
    expect(modeFromMessages([
      { info: { id: "one", role: "user", agent: "sisyphus" } },
      { info: { id: "two", role: "assistant", agent: "plan" } },
    ])).toBeUndefined();
  });
});
