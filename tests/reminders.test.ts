import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { splitReminderTags as clientSplitReminderTags } from "../client/lib/reminders.js";
import { reminderCatalogue } from "../server/reminders/loader.js";
import {
  REMINDER_BODY_MAX,
  REMINDER_DESCRIPTION_MAX,
  REMINDER_TITLE_MAX,
  isValidReminderId,
  parseReminderMarkdown,
  reminderTag,
  splitReminderTags,
  withReminderTag,
  type ReminderPreset,
} from "../server/reminders/reminders.js";

const preset = (id: string, body: string): ReminderPreset => ({
  id,
  title: `${id} title`,
  description: `${id} description`,
  body,
  triggers: [],
});

describe("parseReminderMarkdown", () => {
  it("parses the stock SKILL.md shape", () => {
    expect(parseReminderMarkdown("cite-file-lines", [
      "---", "name: cite-file-lines", "description: Cite code as file:line.", "---", "", "Body one.", "", "Body two.",
    ].join("\n"))).toEqual({
      id: "cite-file-lines",
      title: "Cite File Lines",
      description: "Cite code as file:line.",
      body: "Body one.\n\nBody two.",
      triggers: [],
      source: undefined,
    });
  });

  it("parses provenance without adding it to the reminder body", () => {
    const parsed = parseReminderMarkdown("imported", [
      "---",
      "name: imported",
      "title: Imported reminder",
      "description: A reminder imported from a source skill.",
      "source_repo: https://github.com/example/skills",
      "source_path: skills/imported/SKILL.md",
      "source_commit: 0123456789abcdef0123456789abcdef01234567",
      "---",
      "",
      "Apply the useful instruction.",
    ].join("\n"));
    expect(parsed?.source).toEqual({
      repo: "https://github.com/example/skills",
      path: "skills/imported/SKILL.md",
      commit: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(parsed?.body).toBe("Apply the useful instruction.");
  });

  it("keeps triggers even though per-message injection ignores them", () => {
    const parsed = parseReminderMarkdown("duck-test", [
      "---", "name: duck-test", "description: Emit a duck.", "triggers:", "- duck", "- duck-test", "---", "", "Quack.",
    ].join("\n"));
    expect(parsed?.triggers).toEqual(["duck", "duck-test"]);
  });

  it("tolerates quoted scalars, CRLF and a BOM", () => {
    expect(parseReminderMarkdown(
      "quoted",
      "\uFEFF---\r\nname: \"quoted\"\r\ndescription: 'A quoted one.'\r\n---\r\n\r\nBody.\r\n",
    )).toMatchObject({ description: "A quoted one.", body: "Body." });
  });

  it("rejects malformed files and mismatched names", () => {
    expect(parseReminderMarkdown("good", "just a body")).toBeNull();
    expect(parseReminderMarkdown("good", ["---", "name: good", "description: d", "---", "", ""].join("\n"))).toBeNull();
    expect(parseReminderMarkdown("good", ["---", "name: other", "description: d", "---", "", "body"].join("\n"))).toBeNull();
    expect(parseReminderMarkdown("good", ["---", "description: d", "source_repo: https://example.test", "---", "body"].join("\n"))).toBeNull();
    expect(parseReminderMarkdown("good", [
      "---", "description: d", "source_repo: https://example.test", "source_path: ../SKILL.md", "source_commit: latest", "---", "body",
    ].join("\n"))).toBeNull();
    expect(parseReminderMarkdown("Bad_Id", ["---", "description: d", "---", "", "body"].join("\n"))).toBeNull();
  });
});

describe("isValidReminderId", () => {
  it("matches the OpenCode skill-name contract", () => {
    for (const valid of ["pdf", "cite-file-lines", "a1-b2"]) expect(isValidReminderId(valid)).toBe(true);
    for (const invalid of ["Cite", "a_b", "a--b", "-a", "a-", "", "../etc", 5]) expect(isValidReminderId(invalid)).toBe(false);
  });
});

describe("shipped catalogue", () => {
  const sourceCommit = "8b036a41f578dc6c6307ae0a8dd2857121afcabb";
  const importedIds = new Set([
    "ascii-diagrams",
    "background-subagent",
    "build-waves",
    "deep-research-subagents",
    "docs-and-diagram-tooling",
    "duck-mode",
    "grill-me",
    "human-verification-steps",
    "parallel-research-handoff",
    "red-team-this",
    "session-handoff",
    "worktree-up",
  ]);
  const dir = path.join(import.meta.dirname, "..", "reminders");
  const ids = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  it("loads a non-empty runtime catalogue", () => {
    expect(reminderCatalogue().length).toBeGreaterThan(0);
  });

  it("has unique directory and parsed IDs", () => {
    expect(new Set(ids).size).toBe(ids.length);
    const parsedIds = reminderCatalogue().map(({ id }) => id);
    expect(new Set(parsedIds).size).toBe(parsedIds.length);
    expect(parsedIds).toHaveLength(ids.length);
  });

  it.each(ids)("%s parses and has bounded, safe content", (id) => {
    const parsed = parseReminderMarkdown(id, readFileSync(path.join(dir, id, "SKILL.md"), "utf8"));
    expect(parsed, `reminders/${id}/SKILL.md failed to parse`).not.toBeNull();
    expect(parsed!.title.length).toBeGreaterThan(3);
    expect(parsed!.title.length).toBeLessThanOrEqual(REMINDER_TITLE_MAX);
    expect(parsed!.description.length).toBeGreaterThan(10);
    expect(parsed!.description.length).toBeLessThanOrEqual(REMINDER_DESCRIPTION_MAX);
    expect(parsed!.body.length).toBeGreaterThan(20);
    expect(parsed!.body.length).toBeLessThanOrEqual(REMINDER_BODY_MAX);
    expect(parsed!.triggers).toEqual([]);
    expect(parsed!.body).not.toMatch(/\$\{|\{\{|<%|auto-(?:merge|push)|git\s+reset\s+--hard|git\s+push\s+(?:\S+\s+)?(?:main|master)\b|rm\s+-rf\s+\//i);
  });

  it("records complete, pinned provenance for every imported preset", () => {
    const catalogue = reminderCatalogue();
    expect(catalogue.filter(({ source }) => source)).toHaveLength(importedIds.size);
    for (const reminder of catalogue) {
      if (!importedIds.has(reminder.id)) {
        expect(reminder.source).toBeUndefined();
        continue;
      }
      expect(reminder.source).toEqual({
        repo: "https://github.com/leoncheng57/agent-skills",
        path: `skills/${reminder.id}/SKILL.md`,
        commit: sourceCommit,
      });
      expect(reminder.body).not.toContain(sourceCommit);
      expect(reminder.body).not.toContain(reminder.source!.repo);
    }
  });

  it("ships the guarded native worktree subagent workflow", () => {
    const reminder = reminderCatalogue().find(({ id }) => id === "native-worktree-subagent");
    expect(reminder).toMatchObject({
      title: "Delegate in an Isolated Worktree",
      description: expect.stringContaining("native Task child"),
      triggers: [],
      source: undefined,
    });
    expect(reminder!.body).toContain("child `parentID`");
    expect(reminder!.body).toContain("child session directory remains the parent's directory");
    expect(reminder!.body).toContain("absolute paths");
    expect(reminder!.body).toContain("Bash `workdir` or `git -C <worktree>`");
    expect(reminder!.body).toContain("Before editing, testing, committing, and pushing");
    expect(reminder!.body).toContain("`pwd`");
    expect(reminder!.body).toContain("`git rev-parse --show-toplevel`");
    expect(reminder!.body).toContain("`git status --short --branch`");
    expect(reminder!.body).toContain("Stop immediately on any mismatch");
    expect(reminder!.body).toContain("assigned `external_directory`");
    expect(reminder!.body).toContain("precedence is last-match-wins");
    expect(reminder!.body).toContain("replace targeted worktree allowlists with `*`");
  });
});

describe("reminderTag / withReminderTag", () => {
  const reminder = preset("no-force-push", "Do not force-push.");

  it("wraps and appends the server-resolved body", () => {
    expect(reminderTag(reminder)).toBe('<reminder name="no-force-push">\nDo not force-push.\n</reminder>');
    expect(withReminderTag("now push it", reminder)).toBe(
      'now push it\n\n<reminder name="no-force-push">\nDo not force-push.\n</reminder>',
    );
  });
});

const splitCases: Array<[string, { text: string; reminders: Array<{ name: string; body: string }> }]> = [
  ["plain message", { text: "plain message", reminders: [] }],
  ["", { text: "", reminders: [] }],
  ['do it\n\n<reminder name="alpha">\nFirst rule.\n</reminder>', { text: "do it", reminders: [{ name: "alpha", body: "First rule." }] }],
  ['go\n\n<reminder name="alpha">\nA\n</reminder>\n\n<reminder name="beta-two">\nB\n</reminder>', { text: "go", reminders: [{ name: "alpha", body: "A" }, { name: "beta-two", body: "B" }] }],
  ['<reminder name="alpha">\nline one\n\nline two\n</reminder>', { text: "", reminders: [{ name: "alpha", body: "line one\n\nline two" }] }],
  ['hi <reminder name="Bad_Id">x</reminder>', { text: 'hi <reminder name="Bad_Id">x</reminder>', reminders: [] }],
  ['hi <reminder name="alpha">x', { text: 'hi <reminder name="alpha">x', reminders: [] }],
  ['<reminder name="alpha">\nA\n</reminder>\ntrailing', { text: "trailing", reminders: [{ name: "alpha", body: "A" }] }],
];

describe("splitReminderTags", () => {
  it("keeps server and client implementations in lockstep", () => {
    for (const [input, expected] of splitCases) {
      expect(splitReminderTags(input), `server input: ${JSON.stringify(input)}`).toEqual(expected);
      expect(clientSplitReminderTags(input), `client input: ${JSON.stringify(input)}`).toEqual(expected);
    }
  });

  it("round-trips every shipped preset through both implementations", () => {
    for (const reminder of reminderCatalogue()) {
      const wrapped = withReminderTag("go", reminder);
      const expected = { text: "go", reminders: [{ name: reminder.id, body: reminder.body }] };
      expect(splitReminderTags(wrapped)).toEqual(expected);
      expect(clientSplitReminderTags(wrapped)).toEqual(expected);
    }
  });
});
