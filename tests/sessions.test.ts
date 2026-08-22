import { afterEach, describe, expect, it, vi } from "vitest";

import {
  abortSession,
  listMessages,
  messagePageCursor,
  prompt,
  SessionRuntimeConflictError,
  SessionRuntimeRegistry,
  sessionRuntime,
  toSummary,
} from "../server/opencode/sessions.js";

const UNKNOWN_RUNTIME = { ownership: "unknown-or-external", state: "unknown", abortable: false } as const;

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
    } as Parameters<typeof toSummary>[0], UNKNOWN_RUNTIME);

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
    const summary = toSummary({ share: { url } } as Parameters<typeof toSummary>[0], UNKNOWN_RUNTIME);
    expect(summary.shareUrl).toBeUndefined();
  });
});

describe("process-local session runtime", () => {
  it("keeps runner-created ownership across busy to idle transitions", () => {
    const registry = new SessionRuntimeRegistry();
    registry.claim("/tmp/project", "ses_1");

    expect(sessionRuntime("/tmp/project", "ses_1", { type: "busy" }, registry)).toEqual({
      ownership: "current-server",
      state: "running",
      abortable: true,
    });
    expect(sessionRuntime("/tmp/project", "ses_1", undefined, registry)).toEqual({
      ownership: "current-server",
      state: "idle",
      abortable: false,
    });
  });

  it("does not turn an absent status for an external or pre-restart session into idle", () => {
    expect(sessionRuntime("/tmp/project", "ses_external", undefined, new SessionRuntimeRegistry())).toEqual(UNKNOWN_RUNTIME);
    expect(sessionRuntime("/tmp/project", "ses_owned_before_restart", undefined, new SessionRuntimeRegistry())).toEqual(UNKNOWN_RUNTIME);
  });

  it("preserves current-server retry details", () => {
    expect(sessionRuntime("/tmp/project", "ses_1", {
      type: "retry",
      attempt: 2,
      message: "rate limited",
      next: 1234,
    }, new SessionRuntimeRegistry())).toEqual({
      ownership: "current-server",
      state: "retrying",
      abortable: true,
      attempt: 2,
      message: "rate limited",
      next: 1234,
    });
  });

  it("rejects abort when this server has no abortable run", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(abortSession(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_external",
      new SessionRuntimeRegistry(),
    )).rejects.toMatchObject<Partial<SessionRuntimeConflictError>>({ code: "SESSION_NOT_ABORTABLE" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe("/session/status");
  });

  it("requires an explicit claim before prompting a session with unknown ownership", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(prompt(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_external",
      { text: "continue", mode: "build" },
      new SessionRuntimeRegistry(),
    )).rejects.toMatchObject<Partial<SessionRuntimeConflictError>>({ code: "SESSION_RUNTIME_UNKNOWN" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe("/session/status");
  });

  it("aborts only when the connected server reports current work", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      paths.push(url.pathname);
      return new Response(url.pathname === "/session/status"
        ? JSON.stringify({ ses_1: { type: "busy" } })
        : "true");
    }));

    await abortSession(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_1",
      new SessionRuntimeRegistry(),
    );
    expect(paths).toEqual(["/session/status", "/session/ses_1/abort"]);
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
