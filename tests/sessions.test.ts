import { afterEach, describe, expect, it, vi } from "vitest";

import {
  abortSession,
  canPromptSilently,
  COMPLETED_TTL_MS,
  deleteSession,
  holdsLiveRun,
  listMessages,
  messagePageCursor,
  prompt,
  RUN_START_GRACE_MS,
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

describe("run-scoped session leases", () => {
  const DIR = "/tmp/project";

  it("reports an absent status as unknown, never as idle", () => {
    // 1.18.21 omits idle sessions from /session/status entirely, so absence is
    // the normal reading for every session nobody is currently running.
    expect(sessionRuntime(DIR, "ses_external", undefined, new SessionRuntimeRegistry())).toEqual(UNKNOWN_RUNTIME);
  });

  it("walks a run from starting through running to a witnessed completion", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);

    expect(sessionRuntime(DIR, "ses_1", undefined, registry, 1_000)).toEqual({
      ownership: "current-server", state: "starting", abortable: true,
    });
    expect(sessionRuntime(DIR, "ses_1", { type: "busy" }, registry, 2_000)).toEqual({
      ownership: "current-server", state: "running", abortable: true,
    });
    expect(sessionRuntime(DIR, "ses_1", undefined, registry, 3_000)).toEqual({
      ownership: "current-server", state: "completed", abortable: false,
    });
  });

  it("releases the lease when the startup grace expires without any busy evidence", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);

    expect(sessionRuntime(DIR, "ses_1", undefined, registry, RUN_START_GRACE_MS - 1).state).toBe("starting");
    expect(sessionRuntime(DIR, "ses_1", undefined, registry, RUN_START_GRACE_MS)).toEqual(UNKNOWN_RUNTIME);
    expect(registry.size).toBe(0);
  });

  it("expires a witnessed completion so old evidence cannot masquerade as ownership", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);
    sessionRuntime(DIR, "ses_1", { type: "busy" }, registry, 10);
    sessionRuntime(DIR, "ses_1", undefined, registry, 20);

    expect(sessionRuntime(DIR, "ses_1", undefined, registry, 20 + COMPLETED_TTL_MS - 1).state).toBe("completed");
    expect(sessionRuntime(DIR, "ses_1", undefined, registry, 20 + COMPLETED_TTL_MS)).toEqual(UNKNOWN_RUNTIME);
    expect(registry.size).toBe(0);
  });

  // The regression the manager flagged: run here, then run the same session in
  // an external TUI. The TUI is a different process, so it never appears in
  // this server's status map — a retained claim would call that "idle".
  it("does not claim a session that ran here earlier and may now be external", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);
    sessionRuntime(DIR, "ses_1", { type: "busy" }, registry, 10);
    sessionRuntime(DIR, "ses_1", undefined, registry, 20);

    const laterThanAnyEvidence = 20 + COMPLETED_TTL_MS + 1;
    expect(sessionRuntime(DIR, "ses_1", undefined, registry, laterThanAnyEvidence)).toEqual(UNKNOWN_RUNTIME);
  });

  it("treats a witnessed completion as informational only, never as prompt authority", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);
    sessionRuntime(DIR, "ses_1", { type: "busy" }, registry, 10);
    const completed = sessionRuntime(DIR, "ses_1", undefined, registry, 20);

    expect(completed.abortable).toBe(false);
    expect(canPromptSilently(completed)).toBe(false);
    expect(holdsLiveRun(completed)).toBe(false);
  });

  it("rejects a second lease while one is in flight, including during starting", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);

    expect(() => registry.begin(DIR, "ses_1", 1))
      .toThrowError(expect.objectContaining({ code: "SESSION_ALREADY_RUNNING" }));
  });

  it("allows a fresh lease once the previous run completed", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);
    sessionRuntime(DIR, "ses_1", { type: "busy" }, registry, 10);
    sessionRuntime(DIR, "ses_1", undefined, registry, 20);

    expect(() => registry.begin(DIR, "ses_1", 30)).not.toThrow();
  });

  it("starts every session unknown after a BFF restart", () => {
    const beforeRestart = new SessionRuntimeRegistry();
    beforeRestart.begin(DIR, "ses_1", 0);
    sessionRuntime(DIR, "ses_1", { type: "busy" }, beforeRestart, 10);

    // A restart constructs a new registry; nothing survives.
    const afterRestart = new SessionRuntimeRegistry();
    expect(sessionRuntime(DIR, "ses_1", undefined, afterRestart, 20)).toEqual(UNKNOWN_RUNTIME);
    expect(afterRestart.size).toBe(0);
  });

  it("scopes leases by directory so the same session id elsewhere stays unknown", () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin(DIR, "ses_1", 0);

    expect(sessionRuntime("/tmp/other", "ses_1", undefined, registry, 1)).toEqual(UNKNOWN_RUNTIME);
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

  it("requires an explicit continue before prompting a session with unknown ownership", async () => {
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

  it("requires an explicit continue even after a run this server watched finish", async () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin("/tmp/project", "ses_1", 0);
    sessionRuntime("/tmp/project", "ses_1", { type: "busy" }, registry, 10);
    sessionRuntime("/tmp/project", "ses_1", undefined, registry, 20);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));

    await expect(prompt(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_1",
      { text: "follow up", mode: "build" },
      registry,
    )).rejects.toMatchObject<Partial<SessionRuntimeConflictError>>({ code: "SESSION_RUNTIME_UNKNOWN" });
  });

  // The startup gap: prompt_async has answered but no status proves the run
  // yet. A lease taken only after prompt_async would let this second prompt in.
  it("rejects a duplicate prompt fired during the startup gap", async () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin("/tmp/project", "ses_1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));

    await expect(prompt(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_1",
      { text: "again", mode: "build", confirmContinue: true },
      registry,
    )).rejects.toMatchObject<Partial<SessionRuntimeConflictError>>({ code: "SESSION_ALREADY_RUNNING" });
  });

  it("allows a truthful abort during the startup gap", async () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin("/tmp/project", "ses_1");
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      paths.push(url.pathname);
      return new Response(url.pathname === "/session/status" ? "{}" : "true");
    }));

    await abortSession({ baseUrl: "http://opencode.test" }, "/tmp/project", "ses_1", registry);

    expect(paths).toEqual(["/session/status", "/session/ses_1/abort"]);
    // The abort is a terminal boundary we caused, so the lease stops being live.
    expect(holdsLiveRun(sessionRuntime("/tmp/project", "ses_1", undefined, registry))).toBe(false);
  });

  it("releases the lease when prompt_async fails so the phantom run cannot block retries", async () => {
    const registry = new SessionRuntimeRegistry();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname.endsWith("/prompt_async")) return new Response("nope", { status: 500 });
      if (url.pathname === "/session/status") return new Response("{}");
      if (url.pathname === "/experimental/tool/ids") return new Response(JSON.stringify(["read", "bash"]));
      if (url.pathname === "/agent") {
        return new Response(JSON.stringify([{ name: "build", permission: [{ permission: "*", pattern: "*", action: "allow" }] }]));
      }
      return new Response("[]");
    }));

    await expect(prompt(
      { baseUrl: "http://opencode.test" },
      "/tmp/project",
      "ses_1",
      { text: "go", mode: "build", confirmContinue: true },
      registry,
    )).rejects.toBeTruthy();
    expect(registry.size).toBe(0);
  });

  it("drops the lease when the session is deleted", async () => {
    const registry = new SessionRuntimeRegistry();
    registry.begin("/tmp/project", "ses_1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("true")));

    await deleteSession({ baseUrl: "http://opencode.test" }, "/tmp/project", "ses_1", registry);

    expect(registry.size).toBe(0);
    expect(sessionRuntime("/tmp/project", "ses_1", undefined, registry)).toEqual(UNKNOWN_RUNTIME);
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
