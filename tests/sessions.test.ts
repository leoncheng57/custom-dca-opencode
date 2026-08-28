import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSession,
  firstMeaningfulExcerpt,
  getSessionTurnDiff,
  latestAssistantExcerpt,
  listManagedChildAgents,
  listMessages,
  managedChildTitle,
  messagePageCursor,
  SESSION_EXCERPT_LIMIT,
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

describe("managed child session title", () => {
  // The title is persisted upstream and then copied into session summaries,
  // sub-agent rows, Hub titles, breadcrumbs and notification history, so a
  // credential shape in an assignment must never survive into it. Filtering at
  // render time would have to be right in all of those places at once.
  it.each([
    ["push with ghp_abcdefghijklmnopqrstuvwx now", "ghp_abcdefghijklmnopqrstuvwx", "[redacted-token]"],
    ["call sk-abcdefghijklmnop1234 twice", "sk-abcdefghijklmnop1234", "[redacted-token]"],
    ["send Bearer abc.def-ghi_jkl upstream", "abc.def-ghi_jkl", "[redacted]"],
    ["set api_key=supersecretvalue first", "supersecretvalue", "[redacted]"],
    ["clone https://user:hunter2@example.com/repo.git", "hunter2", "[redacted]"],
  ])("redacts credential shapes in %s", (assignment, secret, marker) => {
    const title = managedChildTitle(assignment);
    expect(title).not.toContain(secret);
    expect(title).toContain(marker);
  });

  it("leaves ordinary development text untouched", () => {
    expect(managedChildTitle("Fix the flaky test in tests/e2e/smoke.api.spec.ts at 2edc379"))
      .toBe("Fix the flaky test in tests/e2e/smoke.api.spec.ts at 2edc379");
  });

  it("still takes only the first line and collapses whitespace", () => {
    expect(managedChildTitle("  First\tline  here \nSecond line with ghp_abcdefghijklmnopqrstuvwx"))
      .toBe("First line here");
  });

  it("falls back when the first line is empty", () => {
    expect(managedChildTitle("\n\nlater content")).toBe("Managed Child");
  });

  // Redaction runs BEFORE the cap: capping first can slice a token into a
  // shape no pattern matches any more, leaving the prefix in the title.
  it("redacts a token that the 80-character cap would otherwise cut", () => {
    const assignment = `${"a".repeat(70)} ghp_abcdefghijklmnopqrstuvwx tail`;
    const title = managedChildTitle(assignment);
    expect(title).toHaveLength(80);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("ghp_");
  });

  it("caps a long redacted first line at 80 characters", () => {
    expect(managedChildTitle("z".repeat(200))).toBe(`${"z".repeat(79)}…`);
  });
});

describe("managed child session creation", () => {
  it("advertises only visible agents with valid, complete policies", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
      if (path === "/experimental/tool/ids") return Response.json(["read", "edit"]);
      if (path === "/agent") return Response.json([
        { name: "plan", description: `  ${"safe ".repeat(80)}  `, permission: [{ permission: "*", pattern: "*", action: "allow" }] },
        { name: "build", permission: [{ permission: "read", pattern: "*", action: "allow" }] },
        { name: "explore", hidden: true, permission: [{ permission: "*", pattern: "*", action: "deny" }] },
        { name: "general", permission: "invalid" },
      ]);
      return new Response("not found", { status: 404 });
    }));

    const agents = await listManagedChildAgents({ baseUrl: "http://opencode.test" }, "/tmp/project");
    expect(agents).toEqual([{ id: "plan", description: expect.any(String), access: "read-only" }]);
    expect(agents[0].description?.length).toBe(240);
  });

  it("forwards the parent, model, metadata and creation-time policy without leaking raw metadata", async () => {
    let payload: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        id: "ses_child",
        title: "Managed child",
        directory: "/tmp/project",
        parentID: "ses_parent",
        agent: "build",
        model: { providerID: "anthropic", id: "claude-opus-5" },
        metadata: payload?.metadata,
        permission: payload?.permission,
        time: { created: 1, updated: 2 },
      });
    }));

    const summary = await createSession({ baseUrl: "http://opencode.test" }, {
      directory: "/tmp/project",
      parentID: "ses_parent",
      title: "Managed child",
      agent: "build",
      model: { providerID: "anthropic", modelID: "claude-opus-5" },
      metadata: {
        customDcaManagedChild: {
          origin: "managed-human",
          requestedMode: "build",
          requestedModel: { providerID: "anthropic", modelID: "claude-opus-5" },
          background: true,
          policyFingerprint: "invalid-until-replaced-below",
        },
        private: "must not escape",
      },
      permission: [{ permission: "bash", pattern: "*", action: "allow" }],
    });

    expect(payload).toMatchObject({
      parentID: "ses_parent",
      agent: "build",
      model: { providerID: "anthropic", id: "claude-opus-5" },
      permission: [{ permission: "bash", pattern: "*", action: "allow" }],
    });
    expect(summary.managed).toMatchObject({
      origin: "managed-human",
      requestedAgent: "build",
      requestedMode: "build",
      requestedModel: { providerID: "anthropic", modelID: "claude-opus-5" },
      background: true,
      policySource: "creation-permission",
      effectivePolicyObserved: false,
    });
    expect(summary).not.toHaveProperty("metadata");
  });

  it("ignores untrusted metadata that does not match the managed launch marker", () => {
    const summary = toSummary({
      metadata: { customDcaManagedChild: { origin: "agent", requestedMode: "build" } },
    } as Parameters<typeof toSummary>[0], false);
    expect(summary.managed).toBeUndefined();
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

describe("notification excerpt extraction", () => {
  // "Rebuilt the bundle and fixed two type errors." — a single complete
  // sentence within the limit — must still return verbatim: a real excerpt
  // used by tests/notifications.test.ts's "agent output excerpts" suite.
  it("returns a single complete sentence unchanged", () => {
    const text = "Rebuilt the bundle and fixed two type errors.";
    expect(firstMeaningfulExcerpt(text, SESSION_EXCERPT_LIMIT)).toBe(text);
  });

  it("keeps only the first sentence when it is not a short boilerplate opener", () => {
    const first = "Rebuilt the notification excerpt logic to prefer sentence boundaries.";
    const second = "Also updated three call sites accordingly.";
    expect(firstMeaningfulExcerpt(`${first} ${second}`, SESSION_EXCERPT_LIMIT)).toBe(first);
  });

  it("combines a short boilerplate opener with the next sentence", () => {
    const opener = "Done.";
    const rest = "Fixed the bug in the auth module and added a regression test.";
    expect(firstMeaningfulExcerpt(`${opener} ${rest}`, SESSION_EXCERPT_LIMIT)).toBe(`${opener} ${rest}`);
  });

  it("prefers the first non-empty line over a cutoff spanning multiple lines", () => {
    const firstLine = "Fixed the parser bug.";
    const rest = "Also rewrote the changelog and unrelated details that would otherwise dominate a single-line cutoff.";
    expect(firstMeaningfulExcerpt(`${firstLine}\n${rest}`, SESSION_EXCERPT_LIMIT)).toBe(firstLine);
  });

  it("returns the flattened text unchanged when no sentence-ending punctuation exists", () => {
    const text = "Updated the config schema, added a migration script, and refreshed the docs";
    expect(firstMeaningfulExcerpt(text, SESSION_EXCERPT_LIMIT)).toBe(text);
  });

  it("bounds a runaway excerpt with no punctuation at all", () => {
    const text = "x".repeat(5_000);
    const result = firstMeaningfulExcerpt(text, SESSION_EXCERPT_LIMIT);
    expect(result.length).toBeLessThanOrEqual(SESSION_EXCERPT_LIMIT);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("does not leak a secret verbatim string beyond its own content", () => {
    // Mirrors the privacy regression in tests/notifications.test.ts: text with
    // no sentence-ending punctuation at all is returned exactly as given.
    const secret = "Wrote the deploy key to /tmp/private/id_rsa";
    expect(firstMeaningfulExcerpt(secret, SESSION_EXCERPT_LIMIT)).toBe(secret);
  });

  it("falls back to a bounded cutoff when a combined short-opener sentence still exceeds the limit", () => {
    const long = "A".repeat(250);
    const text = `Ok. ${long}.`;
    const result = firstMeaningfulExcerpt(text, SESSION_EXCERPT_LIMIT);
    expect(result.length).toBeLessThanOrEqual(SESSION_EXCERPT_LIMIT);
    expect(result.endsWith("\u2026")).toBe(true);
    expect(text.startsWith(result.slice(0, -1))).toBe(true);
  });

  it("returns an empty string for text that is entirely whitespace", () => {
    expect(firstMeaningfulExcerpt("   \n\t  ", SESSION_EXCERPT_LIMIT)).toBe("");
  });
});

describe("latestAssistantExcerpt", () => {
  function messagesResponse(entries: unknown[]) {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(entries)));
  }

  it("scans backwards for the newest assistant turn and skips tool/user messages", async () => {
    messagesResponse([
      { info: { role: "user" }, parts: [{ type: "text", text: "Please fix the flaky test." }] },
      { info: { role: "assistant" }, parts: [{ type: "tool" }, { type: "text", text: "Fixed the flaky test. Also updated the fixture." }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "Thanks, one more thing." }] },
    ]);

    // "Fixed the flaky test." is under the short-sentence threshold, so it is
    // combined with the next sentence — the same rule exercised directly in
    // "notification excerpt extraction" above, here proving it composes
    // correctly with the backward scan and tool/user role filtering.
    await expect(latestAssistantExcerpt({ baseUrl: "http://opencode.test" }, "/tmp/project", "ses_1"))
      .resolves.toBe("Fixed the flaky test. Also updated the fixture.");
  });

  it("joins multiple text parts of the newest assistant message before extracting", async () => {
    messagesResponse([
      { info: { role: "assistant" }, parts: [{ type: "text", text: "Rebuilt the bundle" }, { type: "text", text: "and fixed two type errors." }] },
    ]);

    await expect(latestAssistantExcerpt({ baseUrl: "http://opencode.test" }, "/tmp/project", "ses_1"))
      .resolves.toBe("Rebuilt the bundle and fixed two type errors.");
  });

  it("returns undefined when the transcript has no assistant text", async () => {
    messagesResponse([
      { info: { role: "assistant" }, parts: [{ type: "tool" }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "Anyone there?" }] },
    ]);

    await expect(latestAssistantExcerpt({ baseUrl: "http://opencode.test" }, "/tmp/project", "ses_1"))
      .resolves.toBeUndefined();
  });
});
