import { afterEach, describe, expect, it, vi } from "vitest";

import { getReviewDetails, parseReviewUrl } from "../server/forge.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forge URL parsing", () => {
  it("parses bounded GitHub pull request URLs", () => {
    expect(parseReviewUrl("https://github.com/acme/demo/pull/7")).toMatchObject({
      forge: "github", owner: "acme", repo: "demo", number: 7,
    });
  });

  it("parses configured GitLab merge request URLs", () => {
    expect(parseReviewUrl("https://gitlab.com/group/project/-/merge_requests/42")).toMatchObject({
      forge: "gitlab", project: "group/project", number: 42,
    });
  });

  it("rejects arbitrary and lookalike hosts", () => {
    expect(() => parseReviewUrl("https://github.com.attacker.test/acme/demo/pull/7")).toThrow();
    expect(() => parseReviewUrl("http://127.0.0.1/admin")).toThrow();
  });
});

describe("forge review details", () => {
  it("keeps successful sections when another detail request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/issues/7/comments")) {
        return new Response(JSON.stringify([{ id: 1, user: { login: "reviewer" }, body: "Ship it", created_at: "2026-08-21T10:00:00Z" }]), { status: 200 });
      }
      if (url.endsWith("/pulls/7")) {
        return new Response(JSON.stringify({ head: { sha: "abc123" } }), { status: 200 });
      }
      return new Response("failed", { status: 500 });
    }));

    const details = await getReviewDetails(parseReviewUrl("https://github.com/acme/demo/pull/7"));

    expect(details.partial).toBe(true);
    expect(details.comments).toEqual({
      value: [{ id: "1", author: "reviewer", body: "Ship it", createdAt: "2026-08-21T10:00:00Z", resolved: false }],
      error: null,
    });
    expect(details.pipeline.value).toBeNull();
    expect(details.pipeline.error).toBe("forge returned HTTP 500");
  });
});
