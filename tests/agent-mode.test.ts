import { describe, expect, it } from "vitest";

import { latestModeMessageID, modeFromMessages } from "../client/lib/agentMode.js";

describe("modeFromMessages", () => {
  it("defaults to Build when no persisted agent exists", () => {
    expect(modeFromMessages([])).toBe("build");
    expect(modeFromMessages([{ info: { id: "one", role: "user" } }])).toBe("build");
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
});
