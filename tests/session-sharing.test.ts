import { describe, expect, it } from "vitest";

import {
  serializeSessionJson,
  serializeShareMarkdown,
  shareFilename,
  validatedShareUrl,
} from "../client/lib/sessionSharing.js";
import type { TranscriptEvent } from "../client/lib/transcript.js";

const events: TranscriptEvent[] = [
  {
    kind: "user",
    id: "u1",
    messageId: "m1",
    timestamp: "2026-08-21T12:00:00.000Z",
    text: "Please inspect the project.",
    reminders: [{ name: "secret", body: "hidden reminder body" }],
    attachments: [{ filename: "diagram.png", mime: "image/png", url: "data:image/png;base64,SECRET", path: "/secret/path" }],
  },
  {
    kind: "agent",
    id: "a1",
    messageId: "m2",
    timestamp: "2026-08-21T12:01:00.000Z",
    text: "I inspected it.",
  },
  {
    kind: "thought",
    id: "r1",
    messageId: "m2",
    timestamp: "2026-08-21T12:00:30.000Z",
    text: "Readable reasoning",
    durationMs: 250,
  },
  {
    kind: "tool",
    id: "t1",
    messageId: "m2",
    timestamp: "2026-08-21T12:00:40.000Z",
    name: "bash",
    status: "completed",
    title: "dangerous raw fallback",
    detail: "token=SECRET",
    output: "SECRET output",
    attachments: [],
  },
];

describe("session sharing serialization", () => {
  it("serializes a full normalized transcript without hidden or unsafe fields", () => {
    const markdown = serializeShareMarkdown("Demo\nSession", events, { kind: "session" });
    expect(markdown).toContain("# Demo Session");
    expect(markdown).toContain("Please inspect the project.");
    expect(markdown).toContain("Readable reasoning");
    expect(markdown).toContain("bash · completed");
    expect(markdown).toContain("diagram.png (image/png)");
    expect(markdown).not.toMatch(/hidden reminder|SECRET|dangerous raw|token=|\/secret\/path/);
  });

  it("limits a single-message export to visible author content and attachment metadata", () => {
    const markdown = serializeShareMarkdown("Ignored", events, { kind: "message", messageId: "m1", role: "user" });
    expect(markdown).toContain("Your message");
    expect(markdown).toContain("Please inspect the project.");
    expect(markdown).toContain("diagram.png (image/png)");
    expect(markdown).not.toContain("Assistant message");
    expect(markdown).not.toMatch(/hidden reminder|SECRET|\/secret\/path/);
  });

  it("produces a versioned allowlisted JSON export", () => {
    const json = serializeSessionJson("Demo", events, "2026-08-21T13:00:00.000Z");
    expect(JSON.parse(json)).toMatchObject({
      version: 1,
      title: "Demo",
      exportedAt: "2026-08-21T13:00:00.000Z",
      entries: [
        { type: "message", author: "user", text: "Please inspect the project." },
        { type: "thought", text: "Readable reasoning" },
        { type: "tool", label: "bash", status: "completed" },
        { type: "message", author: "assistant", text: "I inspected it." },
      ],
    });
    expect(json).not.toMatch(/hidden reminder|SECRET|dangerous raw|token=|\/secret\/path/);
  });
});

describe("session sharing validation", () => {
  it("creates bounded safe filenames", () => {
    expect(shareFilename("  ../../My session: demo  ", "md")).toBe("My-session-demo.md");
    expect(shareFilename("***", "json")).toBe("session.json");
    expect(shareFilename("a".repeat(100), "md")).toBe(`${"a".repeat(80)}.md`);
  });

  it("accepts only credential-free HTTP URLs", () => {
    expect(validatedShareUrl("https://share.example/session/1")).toBe("https://share.example/session/1");
    expect(validatedShareUrl("http://localhost:4096/share/1")).toBe("http://localhost:4096/share/1");
    expect(validatedShareUrl("javascript:alert(1)")).toBeNull();
    expect(validatedShareUrl("https://user:pass@example.com/secret")).toBeNull();
    expect(validatedShareUrl(`https://example.com/${"x".repeat(2_100)}`)).toBeNull();
    expect(validatedShareUrl("not a URL")).toBeNull();
  });
});
