import { describe, expect, it, vi } from "vitest";

import { logOmissions, parseCommands, parseMcpServers, parseSkills, parseToolIDs } from "../server/opencode/catalog.js";

describe("safe catalog parsing", () => {
  it("strips skill content, command templates, and absolute location prefixes", () => {
    expect(parseSkills([{ name: "audit", description: "Audit the current page.", location: "/Users/alice/.config/opencode/skills/audit/SKILL.md", content: "secret" }])).toEqual({
      skills: [{ name: "audit", description: "Audit the current page.", location: "audit/SKILL.md" }],
      omitted: [],
    });
    expect(parseCommands([{ name: "ship", description: "Ship safely.", source: "command", agent: "build", subtask: true, template: "do not expose" }])).toEqual({
      commands: [{ name: "ship", description: "Ship safely.", source: "command", agent: "build", subtask: true }],
      omitted: [],
    });
  });

  it("treats a null subtask as absent, not invalid", () => {
    // Verified live against OpenCode 1.18.23: every command without an
    // explicit subtask flag reports `subtask: null`, not an omitted key.
    // Before this, that shape was rejected as "invalid subtask" -- degrading
    // gracefully under issue #297's fix, rather than throwing, but still an
    // unforced drop of a perfectly normal command.
    expect(parseCommands([{ name: "worktree-up", description: "Create a worktree.", subtask: null }])).toEqual({
      commands: [{ name: "worktree-up", description: "Create a worktree." }],
      omitted: [],
    });
  });

  it("accepts every supported MCP status", () => {
    expect(parseMcpServers({
      one: { status: "connected" },
      two: { status: "disabled" },
      three: { status: "failed", error: "offline" },
      four: { status: "needs_auth" },
      five: { status: "needs_client_registration", error: "register" },
    })).toEqual({
      servers: {
        one: { status: "connected" },
        two: { status: "disabled" },
        three: { status: "failed", error: "offline" },
        four: { status: "needs_auth" },
        five: { status: "needs_client_registration", error: "register" },
      },
      omitted: [],
    });
  });

  it("rejects a container that isn't shaped like the expected list/object at all", () => {
    // This is the whole-response boundary: something so fundamentally
    // malformed that there is no list to salvage entries from. Distinct
    // from a single bad entry inside an otherwise-valid container, which
    // the next describe block covers.
    expect(() => parseSkills({ name: "not-an-array" })).toThrow("invalid skill catalogue response");
    expect(() => parseCommands("not-an-array-either")).toThrow("invalid command catalogue response");
    expect(() => parseMcpServers("not-an-object")).toThrow("invalid MCP status response");
  });
});

describe("isolating a single bad entry (issue #297)", () => {
  it("drops one oversized skill description and reports it, keeping every other skill", () => {
    expect(parseSkills([
      { name: "good", description: "Fine." },
      { name: "microsoft-foundry", description: "a".repeat(1_001) },
      { name: "also-good", description: "Also fine." },
    ])).toEqual({
      skills: [
        { name: "good", description: "Fine." },
        { name: "also-good", description: "Also fine." },
      ],
      omitted: [{ index: 1, name: "microsoft-foundry", reason: "invalid description" }],
    });
  });

  it("drops one bad command subtask type and reports it", () => {
    expect(parseCommands([{ name: "x", subtask: "yes" }])).toEqual({
      commands: [],
      omitted: [{ index: 0, name: "x", reason: "invalid subtask" }],
    });
  });

  it("drops one bad MCP server status and reports it, keyed by server name", () => {
    expect(parseMcpServers({ broken: { status: "unknown" }, fine: { status: "connected" } })).toEqual({
      servers: { fine: { status: "connected" } },
      omitted: [{ index: 0, name: "broken", reason: "invalid status" }],
    });
  });

  it("omits the name from the report when the name itself is what failed to validate", () => {
    // A report can never surface an oversized or malformed name just
    // because some OTHER field was the actual problem, but if the name
    // itself is missing/invalid there is nothing safe to preview.
    expect(parseSkills([{ description: "no name at all" }])).toEqual({
      skills: [],
      omitted: [{ index: 0, reason: "invalid name" }],
    });
    expect(parseSkills([{ name: "a".repeat(200), description: "name too long" }])).toEqual({
      skills: [],
      omitted: [{ index: 0, reason: "invalid name" }],
    });
  });

  it("logs one console.warn per dropped entry, naming index/name/reason", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      logOmissions("skill", [{ index: 1, name: "microsoft-foundry", reason: "invalid description" }]);
      logOmissions("MCP server", [{ index: 0, reason: "invalid status" }]);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(1, "[catalog] dropped skill 1 (microsoft-foundry): invalid description");
      expect(warn).toHaveBeenNthCalledWith(2, "[catalog] dropped MCP server 0: invalid status");
    } finally {
      warn.mockRestore();
    }
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
    // The other parsers isolate a bad entry and report it (issue #297); this
    // one degrades the whole registry to null instead, since it is
    // supporting evidence rather than the point of the catalogue.
    expect(() => parseToolIDs("nonsense")).not.toThrow();
    expect(parseToolIDs("nonsense")).toBeNull();
  });
});
