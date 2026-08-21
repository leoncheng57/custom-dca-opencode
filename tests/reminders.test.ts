import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { splitReminderTags as clientSplitReminderTags } from "../client/lib/reminders.js";
import { reminderCatalogue } from "../server/reminders/loader.js";
import {
  isValidReminderId,
  parseReminderMarkdown,
  reminderTag,
  splitReminderTags,
  withReminderTag,
  type ReminderPreset,
} from "../server/reminders/reminders.js";

const preset = (id: string, body: string): ReminderPreset => ({
  id,
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
      description: "Cite code as file:line.",
      body: "Body one.\n\nBody two.",
      triggers: [],
    });
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
  const dir = path.join(import.meta.dirname, "..", "reminders");
  const ids = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  it("loads a non-empty runtime catalogue", () => {
    expect(reminderCatalogue().length).toBeGreaterThan(0);
  });

  it.each(ids)("%s parses and has a usable body", (id) => {
    const parsed = parseReminderMarkdown(id, readFileSync(path.join(dir, id, "SKILL.md"), "utf8"));
    expect(parsed, `reminders/${id}/SKILL.md failed to parse`).not.toBeNull();
    expect(parsed!.description.length).toBeGreaterThan(10);
    expect(parsed!.body.length).toBeGreaterThan(20);
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
