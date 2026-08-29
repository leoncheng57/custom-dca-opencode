import { describe, expect, it } from "vitest";

import { parseCommands, parseMcpServers, parseSkills, parseToolIDs } from "../server/opencode/catalog.js";

describe("safe catalog parsing", () => {
  it("strips skill content, command templates, and absolute location prefixes", () => {
    expect(parseSkills([{ name: "audit", description: "Audit the current page.", location: "/Users/alice/.config/opencode/skills/audit/SKILL.md", content: "secret" }])).toEqual([
      { name: "audit", description: "Audit the current page.", location: "audit/SKILL.md" },
    ]);
    expect(parseCommands([{ name: "ship", description: "Ship safely.", source: "command", agent: "build", subtask: true, template: "do not expose" }])).toEqual([
      { name: "ship", description: "Ship safely.", source: "command", agent: "build", subtask: true },
    ]);
  });

  it("accepts every supported MCP status", () => {
    expect(parseMcpServers({
      one: { status: "connected" },
      two: { status: "disabled" },
      three: { status: "failed", error: "offline" },
      four: { status: "needs_auth" },
      five: { status: "needs_client_registration", error: "register" },
    })).toHaveProperty("five.status", "needs_client_registration");
  });

  it("rejects malformed and oversized upstream data rather than partially claiming success", () => {
    expect(() => parseSkills({ name: "not-an-array" })).toThrow("invalid skill catalogue response");
    expect(() => parseCommands([{ name: "x", subtask: "yes" }])).toThrow("invalid command 0 subtask");
    expect(() => parseMcpServers({ broken: { status: "unknown" } })).toThrow("invalid MCP server broken status");
    expect(() => parseSkills([{ name: "x", description: "a".repeat(1_001) }])).toThrow("invalid skill 0 description");
  });
});

describe("registered tool ids", () => {
  it("keeps the ids the process reports as invocable", () => {
    expect(parseToolIDs(["bash", "read", "task"])).toEqual(["bash", "read", "task"]);
  });

  it("distinguishes an unreadable registry from an empty one", () => {
    // null means "unknown", [] means "the process reports none". Collapsing the
    // two would let a failed read render as a confident "no tools".
    expect(parseToolIDs(undefined)).toBeNull();
    expect(parseToolIDs(null)).toBeNull();
    expect(parseToolIDs({ tools: [] })).toBeNull();
    expect(parseToolIDs(["ok", ""])).toBeNull();
    expect(parseToolIDs(["ok", 7])).toBeNull();
    expect(parseToolIDs([])).toEqual([]);
  });

  it("degrades instead of throwing, so one bad field cannot blank the catalogue", () => {
    // The other parsers throw; this one must not. The tool registry is
    // supporting evidence beside the MCP, skill, and command lists that are the
    // actual point of the panel.
    expect(() => parseToolIDs("nonsense")).not.toThrow();
    expect(parseToolIDs("nonsense")).toBeNull();
  });
});
