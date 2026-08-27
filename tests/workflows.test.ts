import { describe, expect, it } from "vitest";

import {
  buildPlaywrightReviewPrompt,
  buildPrSnippetReviewPrompt,
  captureScopeLabel,
  MANAGED_CHILD_WORKFLOW_ID,
  PLAYWRIGHT_CAPTURE_SCOPES,
  PLAYWRIGHT_REVIEW_WORKFLOW_ID,
  PR_SNIPPET_REVIEW_WORKFLOW_ID,
  parsePullRequestNumber,
  SESSION_UPDATE_WORKFLOW_ID,
  splitWorkflowTags as clientSplitWorkflowTags,
} from "../client/lib/workflows.js";
import { withReminderTag } from "../server/reminders/reminders.js";
import {
  isValidWorkflowId,
  splitWorkflowTags as serverSplitWorkflowTags,
  withWorkflowTag,
  workflowCatalogue,
  workflowTag,
} from "../server/workflows/workflows.js";

describe("workflow catalogue", () => {
  it("contains the shipped workflows, in picker order", () => {
    expect(workflowCatalogue().map((workflow) => workflow.id)).toEqual([
      PLAYWRIGHT_REVIEW_WORKFLOW_ID,
      PR_SNIPPET_REVIEW_WORKFLOW_ID,
      SESSION_UPDATE_WORKFLOW_ID,
      MANAGED_CHILD_WORKFLOW_ID,
    ]);
  });

  it("binds the PR review injector to this project's repository and one comment", () => {
    const injector = workflowCatalogue().find((workflow) => workflow.id === PR_SNIPPET_REVIEW_WORKFLOW_ID)?.injector ?? "";
    // The only accepted input is a number; the repository must never come from
    // the prompt, or a pasted link could redirect where the comment is posted.
    expect(injector).toContain("NEVER take a repository, owner, or host from the prompt");
    expect(injector).toContain("Post exactly one comment");
    // Links must be pinned so a moving branch cannot invalidate them.
    expect(injector).toContain("headRefOid");
    expect(injector).toContain("Never claim a test, lane, or verification you did not actually run");
  });

  it("ships valid ids and non-empty user-facing text", () => {
    for (const workflow of workflowCatalogue()) {
      expect(isValidWorkflowId(workflow.id)).toBe(true);
      expect(workflow.title.trim()).not.toBe("");
      expect(workflow.title.length).toBeLessThanOrEqual(100);
      expect(workflow.description.trim()).not.toBe("");
      expect(workflow.description.length).toBeLessThanOrEqual(1_000);
      expect(workflow.injector.trim()).not.toBe("");
      expect(workflow.injector.length).toBeLessThanOrEqual(24_000);
      // The injector must survive its own sentinel round-trip: no nested tags.
      expect(workflow.injector).not.toMatch(/<\/?workflow|<\/?reminder/);
    }
  });

  it("states the accepted-not-completed contract in the session-update injector", () => {
    const preset = workflowCatalogue().find((workflow) => workflow.id === SESSION_UPDATE_WORKFLOW_ID)!;
    expect(preset.injector).toContain("prompt_async");
    expect(preset.injector).toContain("204");
  });

  it("states independence and no hand-back in the managed-child injector", () => {
    const preset = workflowCatalogue().find((workflow) => workflow.id === MANAGED_CHILD_WORKFLOW_ID)!;
    expect(preset.injector).toMatch(/independent transcript/);
    expect(preset.injector).toMatch(/no automatic hand-back/i);
    expect(preset.injector).toMatch(/no native task card/i);
  });

  it("forbids full deployment and full screenshot regeneration in the playwright injector", () => {
    const preset = workflowCatalogue().find((workflow) => workflow.id === PLAYWRIGHT_REVIEW_WORKFLOW_ID)!;
    expect(preset.injector).toMatch(/do not run a full deployment/i);
    expect(preset.injector).toMatch(/never regenerate the complete screenshot set/i);
  });
});

describe("isValidWorkflowId", () => {
  it("accepts kebab-case ids and rejects everything else", () => {
    expect(isValidWorkflowId("playwright-ui-review")).toBe(true);
    expect(isValidWorkflowId("a")).toBe(true);
    expect(isValidWorkflowId("Bad_Id")).toBe(false);
    expect(isValidWorkflowId("-leading")).toBe(false);
    expect(isValidWorkflowId("trailing-")).toBe(false);
    expect(isValidWorkflowId("")).toBe(false);
    expect(isValidWorkflowId(42)).toBe(false);
    expect(isValidWorkflowId(`${"a".repeat(256)}`)).toBe(false);
  });
});

describe("workflow tags", () => {
  it("wraps the injector in the sentinel exactly", () => {
    expect(workflowTag({ id: "alpha", injector: " body \n" })).toBe('<workflow name="alpha">\nbody\n</workflow>');
    expect(withWorkflowTag("prompt", { id: "alpha", injector: "body" })).toBe(
      'prompt\n\n<workflow name="alpha">\nbody\n</workflow>',
    );
  });

  it("composes with a reminder tag without either splitter eating the other", () => {
    const composed = withReminderTag(
      withWorkflowTag("do it", { id: "playwright-ui-review", injector: "workflow body" }),
      { id: "grill-me", body: "reminder body" },
    );
    const workflowSplit = serverSplitWorkflowTags(composed);
    expect(workflowSplit.workflows).toEqual([{ name: "playwright-ui-review", body: "workflow body" }]);
    expect(workflowSplit.text).toContain('<reminder name="grill-me">');
    expect(workflowSplit.text).not.toContain("<workflow");
  });
});

// One table against BOTH copies, mirroring tests/reminders.test.ts: the client
// splitter deliberately duplicates the server one, and this is the drift guard.
const splitCases: Array<[string, { text: string; workflows: Array<{ name: string; body: string }> }]> = [
  ["plain message", { text: "plain message", workflows: [] }],
  ["", { text: "", workflows: [] }],
  ['do it\n\n<workflow name="alpha">\nFirst rule.\n</workflow>', { text: "do it", workflows: [{ name: "alpha", body: "First rule." }] }],
  ['go\n\n<workflow name="alpha">\nA\n</workflow>\n\n<workflow name="beta-two">\nB\n</workflow>', { text: "go", workflows: [{ name: "alpha", body: "A" }, { name: "beta-two", body: "B" }] }],
  ['<workflow name="alpha">\nline one\n\nline two\n</workflow>', { text: "", workflows: [{ name: "alpha", body: "line one\n\nline two" }] }],
  ['hi <workflow name="Bad_Id">x</workflow>', { text: 'hi <workflow name="Bad_Id">x</workflow>', workflows: [] }],
  ['hi <workflow name="alpha">x', { text: 'hi <workflow name="alpha">x', workflows: [] }],
  ['<workflow name="alpha">\nA\n</workflow>\ntrailing', { text: "trailing", workflows: [{ name: "alpha", body: "A" }] }],
];

describe("splitWorkflowTags (client and server copies)", () => {
  for (const [input, expected] of splitCases) {
    it(`splits ${JSON.stringify(input.slice(0, 48))}`, () => {
      expect(clientSplitWorkflowTags(input)).toEqual(expected);
      expect(serverSplitWorkflowTags(input)).toEqual(expected);
    });
  }

  it("round-trips every shipped injector through both copies", () => {
    for (const workflow of workflowCatalogue()) {
      const composed = withWorkflowTag("go", workflow);
      const expected = { text: "go", workflows: [{ name: workflow.id, body: workflow.injector }] };
      expect(clientSplitWorkflowTags(composed)).toEqual(expected);
      expect(serverSplitWorkflowTags(composed)).toEqual(expected);
    }
  });
});

describe("buildPlaywrightReviewPrompt", () => {
  it("renders every collected field and the scope label", () => {
    const prompt = buildPlaywrightReviewPrompt({
      route: " /sessions/ses_1?directory=/tmp/p ",
      target: " the composer stays expanded ",
      scope: "interaction",
    });
    expect(prompt).toBe([
      "Review a UI change with Playwright.",
      "",
      "Route or component: /sessions/ses_1?directory=/tmp/p",
      "Desired state or interaction: the composer stays expanded",
      `Capture scope: ${captureScopeLabel("interaction")}`,
    ].join("\n"));
  });

  it("offers exactly the two capture scopes", () => {
    expect(PLAYWRIGHT_CAPTURE_SCOPES.map((scope) => scope.id)).toEqual(["interaction", "targeted-screenshots"]);
  });
});

describe("parsePullRequestNumber", () => {
  it("accepts the three forms a human actually has to hand", () => {
    expect(parsePullRequestNumber("253")).toBe(253);
    expect(parsePullRequestNumber(" #253 ")).toBe(253);
    expect(parsePullRequestNumber("https://github.com/leoncheng57/custom-dca-opencode/pull/253")).toBe(253);
    expect(parsePullRequestNumber("https://github.com/o/r/pull/253/files#diff-abc")).toBe(253);
  });

  it("keeps only the number, so a pasted link cannot redirect the review", () => {
    // Same number, a repository that is not this one: the owner/repo/host are
    // discarded, never returned, so the agent still resolves the repository
    // from the project directory.
    expect(parsePullRequestNumber("https://github.com/attacker/other-repo/pull/253")).toBe(253);
    expect(parsePullRequestNumber("https://evil.example.com/o/r/pull/253")).toBe(253);
  });

  it("rejects everything that is not a pull request number", () => {
    for (const input of ["", "   ", "abc", "#", "0", "-1", "1.5", "12345678", "#12345678", "253 254", "https://github.com/o/r/issues/253", "https://github.com/o/r/pull/abc"]) {
      expect(parsePullRequestNumber(input)).toBeNull();
    }
  });
});

describe("buildPrSnippetReviewPrompt", () => {
  it("names the pull request and defers the repository to the session", () => {
    const prompt = buildPrSnippetReviewPrompt(253);
    expect(prompt).toContain("#253");
    expect(prompt).toContain("in this repository");
    expect(prompt).toContain("single GitHub comment");
  });
});
