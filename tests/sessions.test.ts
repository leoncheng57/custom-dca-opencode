import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSessionTurnDiff,
  listMessages,
  messagePageCursor,
  SESSION_TURN_DIFF_LIMITS,
  toSummary,
} from "../server/opencode/sessions.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session summary share state", () => {
  it("exposes only a safe public share URL", () => {
    const summary = toSummary({
      id: "ses_1",
      directory: "/tmp/project",
      share: { url: "https://share.example/s/1" },
      secret: "must not escape",
    } as Parameters<typeof toSummary>[0], false);

    expect(summary.shareUrl).toBe("https://share.example/s/1");
    expect(summary).not.toHaveProperty("share");
    expect(summary).not.toHaveProperty("secret");
  });

  it.each([
    undefined,
    42,
    "javascript:alert(1)",
    "file:///tmp/session",
    "https://user:password@share.example/s/1",
    `https://share.example/${"x".repeat(2_100)}`,
  ])("omits an unsafe upstream share URL: %s", (url) => {
    const summary = toSummary({ share: { url } } as Parameters<typeof toSummary>[0], false);
    expect(summary.shareUrl).toBeUndefined();
  });
});

describe("session message pages", () => {
  it("forwards a bounded limit and before cursor and returns the response cursor", async () => {
    let requested: URL | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      return new Response(JSON.stringify([{ info: { id: "msg_1" }, parts: [] }]), {
        headers: { "X-Next-Cursor": "cursor-older" },
      });
    }));

    const page = await listMessages(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses/1",
      { limit: 25, before: "cursor-current" },
    );

    expect(requested?.pathname).toBe("/session/ses%2F1/message");
    expect(requested?.searchParams.get("directory")).toBe("/tmp/project");
    expect(requested?.searchParams.get("limit")).toBe("25");
    expect(requested?.searchParams.get("before")).toBe("cursor-current");
    expect(page).toEqual({
      messages: [{ info: { id: "msg_1" }, parts: [] }],
      nextCursor: "cursor-older",
    });
  });

  it("defaults to 100 messages and treats an empty page without a cursor as history end", async () => {
    let requested: URL | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      return new Response("[]");
    }));

    await expect(listMessages(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_1",
    )).resolves.toEqual({ messages: [], nextCursor: null });
    expect(requested?.searchParams.get("limit")).toBe("100");
    expect(requested?.searchParams.has("before")).toBe(false);
  });

  it("parses a before cursor from a next Link when the cursor header is absent", () => {
    const headers = new Headers({
      Link: '<http://opencode.test/session/ses_1/message?limit=100&before=link-cursor>; rel="next"',
    });
    expect(messagePageCursor(headers)).toBe("link-cursor");
  });

  it("prefers X-Next-Cursor and ignores malformed or unrelated Links", () => {
    expect(messagePageCursor(new Headers({
      "X-Next-Cursor": "header-cursor",
      Link: '<http://opencode.test/message?before=link-cursor>; rel="next"',
    }))).toBe("header-cursor");
    expect(messagePageCursor(new Headers({ Link: '<not a url>; rel="next", <http://x>; rel="prev"' }))).toBeNull();
  });
});

describe("session turn diffs", () => {
  it("scopes and encodes the upstream request, filters sensitive paths, and exposes only the public shape", async () => {
    let requested: URL | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      return Response.json([
        { file: "src/index.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified", secret: "hidden" },
        { file: ".env.local", patch: "x".repeat(SESSION_TURN_DIFF_LIMITS.characters + 1), additions: 1, deletions: 1, status: "modified" },
        { patch: "missing file", additions: 1, deletions: 0, status: "added" },
        { file: 42, patch: "wrong file type", additions: 1, deletions: 0, status: "added" },
        { file: "   ", patch: "blank file", additions: 1, deletions: 0, status: "added" },
        { file: "src/no-patch.ts", additions: 1, deletions: 0, status: "added" },
        { file: "src/bad-count.ts", patch: "bad count", additions: 0.5, deletions: 0, status: "added" },
        { file: "src/bad-status.ts", patch: "bad status", additions: 1, deletions: 0, status: "renamed" },
      ]);
    }));

    await expect(getSessionTurnDiff(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses/1",
      "msg/1",
    )).resolves.toEqual({
      status: "ok",
      changes: [{ file: "src/index.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }],
    });
    expect(requested?.pathname).toBe("/session/ses%2F1/diff");
    expect(requested?.searchParams.get("directory")).toBe("/tmp/project");
    expect(requested?.searchParams.get("messageID")).toBe("msg/1");
  });

  it.each([
    ["file count", Array.from({ length: SESSION_TURN_DIFF_LIMITS.files + 1 }, (_, index) => ({
      file: `src/${index}.ts`, patch: "line", additions: 1, deletions: 0, status: "added",
    }))],
    ["aggregate characters", [{
      file: "generated/large.ts", patch: "x".repeat(SESSION_TURN_DIFF_LIMITS.characters + 1), additions: 1, deletions: 0, status: "added",
    }]],
    ["aggregate lines", [{
      file: "generated/large.ts", patch: "x\n".repeat(SESSION_TURN_DIFF_LIMITS.lines), additions: 1, deletions: 0, status: "added",
    }]],
  ])("rejects a diff over the %s bound without returning partial patches", async (_name, changes) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(changes)));

    await expect(getSessionTurnDiff(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_1",
      "msg_1",
    )).resolves.toEqual({ status: "too_large" });
  });
});
