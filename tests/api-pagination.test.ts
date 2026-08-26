import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../client/lib/api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcript API pagination", () => {
  it("requests a bounded newest page by default", async () => {
    let requested = "";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ messages: [], running: false, nextCursor: null }));
    }));

    await api.messages("/tmp/project", "ses_1");

    const url = new URL(requested, "http://client.test");
    expect(url.pathname).toBe("/api/sessions/ses_1/messages");
    expect(url.searchParams.get("directory")).toBe("/tmp/project");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.has("before")).toBe(false);
  });

  it("forwards an older-page cursor and preserves the typed page shape", async () => {
    let requested = "";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({
        messages: [{ info: { id: "msg_1" }, parts: [] }],
        running: true,
        nextCursor: "cursor-next",
      }));
    }));

    const page = await api.messages("/tmp/project", "ses_1", { limit: 50, before: "cursor-current" });

    const url = new URL(requested, "http://client.test");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("before")).toBe("cursor-current");
    expect(page).toEqual({
      messages: [{ info: { id: "msg_1" }, parts: [] }],
      running: true,
      nextCursor: "cursor-next",
    });
  });
});

describe("session turn diff API", () => {
  it("encodes the session and message ids and preserves the typed response", async () => {
    let requested = "";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested = String(input);
      return Response.json({
        changes: [{ file: "src/index.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }],
      });
    }));

    const result = await api.sessionTurnDiff("/tmp/project", "ses/1", "msg/1");

    const url = new URL(requested, "http://client.test");
    expect(url.pathname).toBe("/api/sessions/ses%2F1/diff");
    expect(url.searchParams.get("directory")).toBe("/tmp/project");
    expect(url.searchParams.get("userMessageID")).toBe("msg/1");
    expect(result.changes[0]).toEqual({
      file: "src/index.ts",
      patch: "@@ -1 +1 @@\n-old\n+new",
      additions: 1,
      deletions: 1,
      status: "modified",
    });
  });

  it("threads cancellation to the diff request", async () => {
    const controller = new AbortController();
    let requestedSignal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      requestedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }));

    const result = api.sessionTurnDiff("/tmp/project", "ses_1", "msg_1", controller.signal);
    controller.abort();

    expect(requestedSignal).toBe(controller.signal);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
