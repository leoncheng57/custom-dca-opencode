import { describe, expect, it } from "vitest";

import { parseCommands, parseMcpServers, parseSkills } from "../server/opencode/catalog.js";

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
