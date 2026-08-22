import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../client/lib/api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session runtime API", () => {
  it("surfaces a typed unknown-ownership conflict and sends an explicit claim only when requested", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        return new Response(JSON.stringify({
          error: "This session is not controlled by this server.",
          code: "SESSION_RUNTIME_UNKNOWN",
        }), { status: 409 });
      }
      return new Response(JSON.stringify({ accepted: true }), { status: 202 });
    }));

    await expect(api.prompt("/tmp/project", "ses_1", "continue", "build"))
      .rejects.toMatchObject<Partial<ApiError>>({ status: 409, code: "SESSION_RUNTIME_UNKNOWN" });
    await expect(api.prompt("/tmp/project", "ses_1", "continue", "build", undefined, undefined, undefined, true))
      .resolves.toEqual({ accepted: true });
    expect(bodies).toEqual([
      { text: "continue", mode: "build" },
      { text: "continue", mode: "build", claimUnknown: true },
    ]);
  });
});

describe("transcript API pagination", () => {
  it("requests a bounded newest page by default", async () => {
    let requested = "";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ messages: [], runtime: { ownership: "unknown-or-external", state: "unknown", abortable: false }, nextCursor: null }));
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
        runtime: { ownership: "current-server", state: "running", abortable: true },
        nextCursor: "cursor-next",
      }));
    }));

    const page = await api.messages("/tmp/project", "ses_1", { limit: 50, before: "cursor-current" });

    const url = new URL(requested, "http://client.test");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("before")).toBe("cursor-current");
    expect(page).toEqual({
      messages: [{ info: { id: "msg_1" }, parts: [] }],
      runtime: { ownership: "current-server", state: "running", abortable: true },
      nextCursor: "cursor-next",
    });
  });
});
