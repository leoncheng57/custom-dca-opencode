import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseSimulation } from "../client/lib/simulation.js";
import { reminderCatalogue } from "../server/reminders/loader.js";
import { workflowCatalogue } from "../server/workflows/workflows.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "client", "simulations");

function files(kind: "workflows" | "reminders"): string[] {
  return readdirSync(path.join(DIR, kind))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/u, ""))
    .sort();
}

function read(kind: "workflows" | "reminders", id: string): string {
  return readFileSync(path.join(DIR, kind, `${id}.md`), "utf8");
}

/**
 * Every shipped workflow and reminder must have a worked example.
 *
 * This is the guarantee, not a nice-to-have: the simulations were originally
 * keyed to the retired command catalogue, so when commands were deleted the
 * examples went with them even for the eight workflows that survived. A
 * coverage assertion is what stops that happening silently a second time.
 *
 * It runs in BOTH directions. Missing means a shipped id has no example.
 * Orphaned means an example survives for something no longer shipped, which is
 * how a file describing a deleted capability lingers as documentation for a
 * feature nobody can invoke.
 */
describe("simulation coverage", () => {
  const workflowIDs = workflowCatalogue().map(({ id }) => id).sort();
  const reminderIDs = reminderCatalogue().map(({ id }) => id).sort();

  it("gives every shipped workflow exactly one simulation, and no orphans", () => {
    expect(files("workflows")).toEqual(workflowIDs);
  });

  it("gives every shipped reminder exactly one simulation, and no orphans", () => {
    expect(files("reminders")).toEqual(reminderIDs);
  });

  // A workflow and a reminder may share an id — `session-handoff` does — so the
  // two catalogues live in separate directories. A single flat directory would
  // silently serve one's example for the other.
  it("keeps the two catalogues in separate directories", () => {
    expect(workflowIDs).toContain("session-handoff");
    expect(reminderIDs).toContain("session-handoff");
    expect(read("workflows", "session-handoff")).not.toEqual(read("reminders", "session-handoff"));
  });

  it.each([
    ...workflowIDs.map((id) => ["workflows", id] as const),
    ...reminderIDs.map((id) => ["reminders", id] as const),
  ])("%s/%s parses and is keyed to its own id", (kind, id) => {
    const simulation = parseSimulation(read(kind, id));
    expect(simulation, `${kind}/${id}.md failed to parse`).not.toBeNull();
    // The trigger used to be a slash command (`/goal`). Commands are retired, so
    // it now names the id the example belongs to; asserting it here is what
    // catches a copy-pasted file that still points at its source.
    expect(simulation!.trigger).toBe(id);
    expect(simulation!.title.length).toBeGreaterThan(3);
    expect(simulation!.caveat.length).toBeGreaterThan(10);
    expect(simulation!.turns.length).toBeGreaterThan(1);
    expect(simulation!.turns[0]!.role).toBe("user");
  });

  // Named exactly rather than matched by shape. A `^/[a-z]` pattern also hits
  // `/etc/passwd` in a table about rejected paths and every `/playbooks/...`
  // route, so it would fail on legitimate prose.
  const RETIRED_COMMANDS = [
    "background", "build-waves", "cite-file-lines", "dca", "deep-research", "diagram",
    "docs-preview", "duck-mode", "goal", "grill-me", "handoff", "leaving-now-wrap-up",
    "manager-children", "mini-design-doc", "native-worktree-subagents", "red-team",
    "research-handoff", "review-learning", "session-handoff", "standup",
    "system-design-artifacts", "verify", "worktree-up",
  ];

  it("no longer invokes the retired slash commands", () => {
    const pattern = new RegExp(String.raw`^/(?:${RETIRED_COMMANDS.join("|")})(?:\s|$)`, "mu");
    for (const kind of ["workflows", "reminders"] as const) {
      for (const id of files(kind)) {
        expect(read(kind, id), `${kind}/${id}.md still invokes a retired slash command`)
          .not.toMatch(pattern);
      }
    }
  });
});
