import { describe, expect, it } from "vitest";

import {
  MAX_REFERENCE_CANDIDATES,
  collectMarkdownReferences,
  describeLineRange,
  parseWorkspaceReference,
  referenceCandidatesFromEvents,
  workspaceRelativePath,
} from "../client/lib/fileReferences.js";
import type { TranscriptEvent } from "../client/lib/transcript.js";

describe("workspace reference parsing", () => {
  it("accepts the reference forms the transcript actually contains", () => {
    expect(parseWorkspaceReference("client/pages/Conversation.tsx")).toEqual({
      path: "client/pages/Conversation.tsx",
    });
    expect(parseWorkspaceReference("client/pages/Conversation.tsx:724")).toEqual({
      path: "client/pages/Conversation.tsx",
      startLine: 724,
    });
    expect(parseWorkspaceReference("server/routes/workspace.ts:20-40")).toEqual({
      path: "server/routes/workspace.ts",
      startLine: 20,
      endLine: 40,
    });
    expect(parseWorkspaceReference("client/ds/markdown.tsx#L150-L176")).toEqual({
      path: "client/ds/markdown.tsx",
      startLine: 150,
      endLine: 176,
    });
    expect(parseWorkspaceReference("client/ds/markdown.tsx#L150-176")).toEqual({
      path: "client/ds/markdown.tsx",
      startLine: 150,
      endLine: 176,
    });
    // The explicit local-link spelling from a markdown link target.
    expect(parseWorkspaceReference("file:server/routes/workspace.ts#L20")).toEqual({
      path: "server/routes/workspace.ts",
      startLine: 20,
    });
    expect(parseWorkspaceReference("./AGENTS.md")).toEqual({ path: "AGENTS.md" });
    expect(parseWorkspaceReference("  AGENTS.md  ")).toEqual({ path: "AGENTS.md" });
  });

  it("rejects everything the server would have to refuse anyway", () => {
    for (const candidate of [
      "",
      "   ",
      "/etc/passwd",
      "~/.ssh/id_rsa",
      "../../etc/passwd",
      "server/../../etc/passwd",
      "file:///etc/passwd",
      "https://example.com/x.ts",
      "C:\\Windows\\system32",
      "C:/Windows/system32",
      "\\\\server\\share\\x.ts",
      "server\\routes\\workspace.ts",
      "src/index.ts?raw=1",
      "src/index.ts#section",
      "src/index.ts\u0000",
      "npm test",
      "rm -rf *",
      "src//index.ts",
      "#L20",
    ]) {
      expect(parseWorkspaceReference(candidate), candidate).toBeNull();
    }
  });

  it("requires a candidate to look like a file rather than a bare word", () => {
    // A single bare word is prose far more often than a path.
    expect(parseWorkspaceReference("build")).toBeNull();
    expect(parseWorkspaceReference("README")).toBeNull();
    // An extension or a directory separator is enough structure to ask about.
    expect(parseWorkspaceReference("README.md")).toEqual({ path: "README.md" });
    expect(parseWorkspaceReference("docs/mobile")).toEqual({ path: "docs/mobile" });
  });

  it("bounds path length, depth and line numbers", () => {
    expect(parseWorkspaceReference(`${"a/".repeat(40)}x.ts`)).toBeNull();
    expect(parseWorkspaceReference(`${"a".repeat(600)}.ts`)).toBeNull();
    // A malformed range loses the range, never the file.
    expect(parseWorkspaceReference("src/index.ts:0")).toEqual({ path: "src/index.ts" });
    expect(parseWorkspaceReference("src/index.ts:40-20")).toEqual({ path: "src/index.ts", startLine: 40 });
    expect(parseWorkspaceReference("src/index.ts:99999999")).toEqual({ path: "src/index.ts" });
  });

  it("describes a range for accessible names", () => {
    expect(describeLineRange({ path: "a.ts" })).toBe("");
    expect(describeLineRange({ path: "a.ts", startLine: 4 })).toBe(" line 4");
    expect(describeLineRange({ path: "a.ts", startLine: 4, endLine: 4 })).toBe(" line 4");
    expect(describeLineRange({ path: "a.ts", startLine: 4, endLine: 9 })).toBe(" lines 4 to 9");
  });
});

describe("markdown candidate collection", () => {
  it("reads inline code and explicit links only", () => {
    const source = [
      "See `server/routes/workspace.ts:20` and [route](file:client/lib/api.ts#L3).",
      "The file server/routes/workspace.ts is mentioned in prose here.",
      "[External](https://example.com/x.ts)",
    ].join("\n");
    expect(collectMarkdownReferences(source)).toEqual([
      "server/routes/workspace.ts:20",
      "file:client/lib/api.ts#L3",
      "https://example.com/x.ts",
    ]);
  });

  it("ignores candidates inside fenced blocks", () => {
    const source = [
      "Before `real/one.ts`",
      "```ts",
      "import x from \"fenced/example.ts\";",
      "`fenced/inline.ts`",
      "```",
      "After `real/two.ts`",
    ].join("\n");
    expect(collectMarkdownReferences(source)).toEqual(["real/one.ts", "real/two.ts"]);
  });

  it("ignores an unterminated fence rather than reopening it", () => {
    const source = ["Before `real/one.ts`", "```", "`fenced/inline.ts`"].join("\n");
    expect(collectMarkdownReferences(source)).toEqual(["real/one.ts"]);
  });
});

describe("attachment paths", () => {
  it("relativises workspace paths and refuses everything else", () => {
    expect(workspaceRelativePath("/tmp/project/src/index.ts", "/tmp/project")).toBe("src/index.ts");
    expect(workspaceRelativePath("/tmp/project/src/index.ts", "/tmp/project/")).toBe("src/index.ts");
    expect(workspaceRelativePath("/tmp/other/src/index.ts", "/tmp/project")).toBeNull();
    expect(workspaceRelativePath("/tmp/project-two/x.ts", "/tmp/project")).toBeNull();
    expect(workspaceRelativePath("/tmp/project", "/tmp/project")).toBeNull();
    // Already relative: the backend does not always state an absolute path.
    expect(workspaceRelativePath("src/index.ts", "/tmp/project")).toBe("src/index.ts");
  });
});

describe("transcript candidates", () => {
  const agent = (id: string, text: string): TranscriptEvent => ({
    kind: "agent",
    id,
    messageId: id,
    timestamp: "2026-01-01T00:00:00.000Z",
    text,
  });

  it("deduplicates by path across messages and attachment kinds", () => {
    const events: TranscriptEvent[] = [
      agent("a", "See `src/index.ts:10` and `src/index.ts:40-60`."),
      agent("b", "Also `src/index.ts` and `docs/guide.md`."),
      {
        kind: "user",
        id: "u",
        messageId: "u",
        timestamp: "2026-01-01T00:00:00.000Z",
        text: "look",
        reminders: [],
        attachments: [
          { filename: "index.ts", path: "/tmp/project/src/index.ts" },
          { filename: "outside.ts", path: "/tmp/elsewhere/outside.ts" },
          { filename: "pasted.png", url: "data:image/png;base64,AA" },
        ],
      },
    ];
    expect(referenceCandidatesFromEvents(events, "/tmp/project")).toEqual([
      "src/index.ts",
      "docs/guide.md",
    ]);
  });

  it("never asks about fenced or unparsable candidates", () => {
    const events = [agent("a", "```\n`fenced/example.ts`\n```\nplain prose src/index.ts")];
    expect(referenceCandidatesFromEvents(events, "/tmp/project")).toEqual([]);
  });

  it("caps the batch a single transcript can request", () => {
    const text = Array.from({ length: MAX_REFERENCE_CANDIDATES + 50 }, (_, index) => `\`src/file${index}.ts\``).join(" ");
    expect(referenceCandidatesFromEvents([agent("a", text)], "/tmp/project")).toHaveLength(
      MAX_REFERENCE_CANDIDATES,
    );
  });
});
