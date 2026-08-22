import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../client/lib/api.js";
import {
  buildPaletteCommands,
  rankPaletteCommands,
  resolvePaletteDirectory,
  sessionLabel,
  type PaletteCommand,
} from "../client/lib/palette.js";

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "ses_alpha",
    title: "Add a health endpoint",
    directory: "/tmp/project one",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    archived: false,
    runtime: { ownership: "unknown-or-external", state: "unknown", abortable: false },
    ...overrides,
  };
}

describe("palette model", () => {
  it("resolves the URL directory before saved state", () => {
    expect(resolvePaletteDirectory("?directory=%2Ftmp%2Furl", "/tmp/saved")).toBe("/tmp/url");
    expect(resolvePaletteDirectory("", " /tmp/saved ")).toBe("/tmp/saved");
    expect(resolvePaletteDirectory("?directory=", "/tmp/saved")).toBe("/tmp/saved");
    expect(resolvePaletteDirectory("", null)).toBe("");
  });

  it("builds navigation, actions, then canonical session links", () => {
    const run = vi.fn();
    const commands = buildPaletteCommands({
      navigation: [{ id: "home", title: "Home", to: "/" }],
      actions: [{ id: "phone", title: "Open on phone", run }],
      sessions: [session({ runtime: { ownership: "current-server", state: "running", abortable: true } })],
    });
    expect(commands.map((command) => command.kind)).toEqual(["navigation", "action", "conversation"]);
    expect(commands[2]).toMatchObject({
      subtitle: "Running",
      to: "/sessions/ses_alpha?directory=%2Ftmp%2Fproject%20one",
    });
    commands[1].run?.();
    expect(run).toHaveBeenCalledOnce();
    expect(commands.every((command) => !/\s/.test(command.id))).toBe(true);
  });

  it("uses a short fallback for untitled sessions", () => {
    expect(sessionLabel(session({ id: "ses_123456789", title: "  " }))).toBe("Session ses_1234");
  });
});

describe("rankPaletteCommands", () => {
  it("preserves natural order for blank queries and applies limits", () => {
    const commands: PaletteCommand[] = [
      { id: "b", kind: "conversation", title: "Beta", group: "test" },
      { id: "a", kind: "navigation", title: "Alpha", group: "test" },
    ];
    expect(rankPaletteCommands(commands, "   ")).toEqual(commands);
    expect(rankPaletteCommands(commands, "", 1)).toEqual([commands[0]]);
  });

  it("ranks title prefix before word prefix before substring", () => {
    const commands: PaletteCommand[] = [
      { id: "substring", kind: "navigation", title: "Determine", group: "test" },
      { id: "word", kind: "navigation", title: "Open terminal", group: "test" },
      { id: "title", kind: "navigation", title: "Terminal", group: "test" },
    ];
    expect(rankPaletteCommands(commands, "term").map((command) => command.id)).toEqual([
      "title",
      "word",
      "substring",
    ]);
  });

  it("recognizes path, dot, dash, underscore and space segment prefixes", () => {
    const commands: PaletteCommand[] = [
      { id: "substring", kind: "navigation", title: "xxmapxx", group: "test" },
      { id: "slash", kind: "navigation", title: "a/map", group: "test" },
      { id: "dot", kind: "navigation", title: "b.map", group: "test" },
      { id: "dash", kind: "navigation", title: "c-map", group: "test" },
      { id: "underscore", kind: "navigation", title: "d_map", group: "test" },
      { id: "space", kind: "navigation", title: "e map", group: "test" },
    ];
    expect(rankPaletteCommands(commands, "map").at(-1)?.id).toBe("substring");
  });

  it("breaks ties by kind, locale title, then input order", () => {
    const commands: PaletteCommand[] = [
      { id: "conversation", kind: "conversation", title: "Same", group: "test" },
      { id: "action", kind: "action", title: "Same", group: "test" },
      { id: "nav-z", kind: "navigation", title: "Same z", group: "test" },
      { id: "nav-a", kind: "navigation", title: "Same a", group: "test" },
      { id: "nav-a-2", kind: "navigation", title: "Same a", group: "test" },
    ];
    expect(rankPaletteCommands(commands, "same").map((command) => command.id)).toEqual([
      "nav-a",
      "nav-a-2",
      "nav-z",
      "action",
      "conversation",
    ]);
  });

  it("matches keywords case-insensitively and drops misses", () => {
    const commands: PaletteCommand[] = [
      { id: "phone", kind: "action", title: "Open on phone", group: "test", keywords: ["QR code"] },
    ];
    expect(rankPaletteCommands(commands, "CODE")).toEqual(commands);
    expect(rankPaletteCommands(commands, "missing")).toEqual([]);
  });

  it("keeps identical title ties stable", () => {
    const commands: PaletteCommand[] = [
      { id: "first", kind: "navigation", title: "Home", group: "test" },
      { id: "second", kind: "navigation", title: "Home", group: "test" },
    ];
    expect(rankPaletteCommands(commands, "home").map((command) => command.id)).toEqual(["first", "second"]);
  });
});
