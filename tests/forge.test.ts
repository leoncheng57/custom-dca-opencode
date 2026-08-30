import { afterEach, describe, expect, it, vi } from "vitest";

import { mergeReview, parseReviewUrl } from "../server/forge.js";
import {
  commitWebUrl,
  detailDuration,
  getReviewDetails,
  normalizeDetailStatus,
  REVIEW_DETAIL_LIMITS,
} from "../server/forge-details.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

describe("forge detail helpers", () => {
  it("normalizes statuses and computes durations", () => {
    expect(normalizeDetailStatus("success")).toBe("passed");
    expect(normalizeDetailStatus("timed_out")).toBe("failed");
    expect(normalizeDetailStatus("in_progress")).toBe("running");
    expect(detailDuration("2026-08-21T10:00:00Z", "2026-08-21T10:01:30Z")).toBe(90);
    expect(detailDuration("bad", "also bad")).toBeNull();
  });
});

describe("GitHub review details", () => {
  it("maps description, comments, review summaries, checks, contexts, and durations", async () => {
    vi.stubEnv("GITHUB_TOKEN", "server-secret");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const target = String(input);
      if (target.includes("/issues/7/comments")) return response([{ id: 1, user: { login: "alice" }, body: "Looks good", created_at: "2026-08-21T10:00:00Z" }]);
      if (target.includes("/pulls/7/reviews")) return response([{ id: 2, user: { login: "bob" }, state: "APPROVED", body: "Ship it", submitted_at: "2026-08-21T10:02:00Z" }]);
      if (target.includes("/pulls/7/commits")) return response([{ sha: "abc123def4567890", html_url: "https://github.com/acme/demo/commit/abc123def4567890", author: { login: "dana" }, commit: { message: "Add the widget\n\nBody text", author: { name: "Dana", date: "2026-08-21T09:55:00Z" } } }]);
      if (target.includes("/check-runs")) return response({ total_count: 1, check_runs: [{ id: 3, name: "build", status: "completed", conclusion: "failure", details_url: "https://github.com/acme/demo/actions/3", started_at: "2026-08-21T10:00:00Z", completed_at: "2026-08-21T10:01:00Z", app: { name: "CI" } }] });
      if (target.includes("/commits/abc123/status")) return response({ total_count: 1, statuses: [{ id: 4, context: "coverage", state: "success", target_url: "https://example.test/coverage", created_at: "2026-08-21T10:00:00Z", updated_at: "2026-08-21T10:00:30Z" }] });
      return response({ body: "## Description", head: { sha: "abc123" } });
    }));

    const details = await getReviewDetails(parseReviewUrl("https://github.com/acme/demo/pull/7"));

    expect(details.description.value).toBe("## Description");
    expect(details.comments.value[0]).toMatchObject({ author: "alice", body: "Looks good" });
    expect(details.reviews.value[0]).toMatchObject({ author: "bob", state: "approved" });
    expect(details.checks.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "build", status: "failed", duration: 60, source: "check" }),
      expect.objectContaining({ name: "coverage", status: "passed", duration: 30, source: "status" }),
    ]));
    expect(details.commits.value).toEqual([expect.objectContaining({
      shortSha: "abc123d", subject: "Add the widget", author: "dana",
      webUrl: "https://github.com/acme/demo/commit/abc123def4567890",
    })]);
    expect(details.auth).toBe("available");
    expect(details.partial).toBe(false);
  });

  it("bounds item counts and body lengths with truncation flags", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const target = String(input);
      if (target.includes("/issues/7/comments")) return response(Array.from({ length: 51 }, (_, id) => ({ id, body: "x".repeat(REVIEW_DETAIL_LIMITS.bodyCharacters + 1) })));
      if (target.includes("/pulls/7/reviews")) return response(Array.from({ length: 26 }, (_, id) => ({ id })));
      if (target.includes("/pulls/7/commits")) return response(Array.from({ length: REVIEW_DETAIL_LIMITS.commits + 1 }, (_, id) => ({ sha: String(id).padStart(40, "0"), commit: { message: "s".repeat(REVIEW_DETAIL_LIMITS.subjectCharacters + 1) } })));
      if (target.includes("/check-runs")) return response({ total_count: 101, check_runs: [{ id: 1, status: "queued" }] });
      if (target.includes("/commits/abc123/status")) return response({ total_count: 0, statuses: [] });
      return response({ body: "d".repeat(REVIEW_DETAIL_LIMITS.descriptionCharacters + 1), head: { sha: "abc123" } });
    }));

    const details = await getReviewDetails(parseReviewUrl("https://github.com/acme/demo/pull/7"));
    expect(details.description.value).toHaveLength(REVIEW_DETAIL_LIMITS.descriptionCharacters);
    expect(details.description.truncated).toBe(true);
    expect(details.comments.value).toHaveLength(REVIEW_DETAIL_LIMITS.comments);
    expect(details.comments.truncated).toBe(true);
    expect(details.comments.value[0].bodyTruncated).toBe(true);
    expect(details.reviews.value).toHaveLength(REVIEW_DETAIL_LIMITS.reviews);
    expect(details.reviews.truncated).toBe(true);
    expect(details.checks.truncated).toBe(true);
    expect(details.commits.value).toHaveLength(REVIEW_DETAIL_LIMITS.commits);
    expect(details.commits.truncated).toBe(true);
    expect(details.commits.value[0].subject).toHaveLength(REVIEW_DETAIL_LIMITS.subjectCharacters);
    expect(details.commits.value[0].subjectTruncated).toBe(true);
  });

  it("keeps successful sections, sanitizes failures, and reports rate limiting", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const target = String(input);
      if (target.includes("/issues/7/comments")) return response([{ id: 1, body: "visible" }]);
      if (target.includes("/pulls/7/reviews")) return response("token=must-not-leak", 500);
      if (target.includes("/pulls/7/commits")) return response("commit-secret-body", 500);
      if (target.includes("/check-runs")) return response("secret raw body", 429);
      if (target.includes("/commits/abc123/status")) return response({ statuses: [] });
      return response({ body: "available", head: { sha: "abc123" } });
    }));

    const details = await getReviewDetails(parseReviewUrl("https://github.com/acme/demo/pull/7"));
    expect(details.description.value).toBe("available");
    expect(details.comments.value[0].body).toBe("visible");
    expect(details.reviews.error).toBe("Unavailable");
    expect(details.checks.error).toBe("Unavailable");
    expect(details.commits.error).toBe("Unavailable");
    expect(JSON.stringify(details)).not.toContain("must-not-leak");
    expect(JSON.stringify(details)).not.toContain("secret raw body");
    expect(JSON.stringify(details)).not.toContain("commit-secret-body");
    expect(details.auth).toBe("rate_limited");
    expect(details.partial).toBe(true);
  });

  it("reports authentication failures without exposing the upstream response", async () => {
    vi.stubEnv("GITHUB_TOKEN", "expired-server-secret");
    vi.stubGlobal("fetch", vi.fn(async () => response("credential rejected: expired-server-secret", 401)));

    const details = await getReviewDetails(parseReviewUrl("https://github.com/acme/demo/pull/7"));
    expect(details.auth).toBe("unavailable");
    expect(details.description.error).toBe("Authentication unavailable");
    expect(JSON.stringify(details)).not.toContain("expired-server-secret");
  });

  it("coalesces duplicate in-flight detail requests", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      calls++;
      const target = String(input);
      if (target.includes("/pulls/7?") || target.endsWith("/pulls/7")) return response({ head: { sha: "abc123" } });
      if (target.includes("/check-runs")) return response({ check_runs: [] });
      if (target.includes("/status")) return response({ statuses: [] });
      return response([]);
    }));
    const ref = parseReviewUrl("https://github.com/acme/demo/pull/7");
    const first = getReviewDetails(ref);
    const second = getReviewDetails(ref);
    expect(first).toBe(second);
    await first;
    expect(calls).toBe(6);
  });
});

describe("GitLab review details", () => {
  it("maps discussions, pipelines, jobs, status, and reported duration", async () => {
    vi.stubEnv("GITLAB_TOKEN", "server-secret");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const target = String(input);
      if (target.includes("/discussions")) return response([{ id: "thread-1", notes: [{ id: 1, author: { username: "carol" }, body: "Please fix", created_at: "2026-08-21T10:00:00Z", resolved: false }, { id: 2, system: true, body: "changed title" }] }]);
      if (target.includes("/merge_requests/42/pipelines")) return response([{ id: 9, status: "failed", web_url: "https://gitlab.com/group/project/-/pipelines/9", created_at: "2026-08-21T10:00:00Z", updated_at: "2026-08-21T10:02:00Z" }]);
      if (target.includes("/pipelines/9/jobs")) return response([{ id: 10, name: "test", stage: "verify", status: "failed", web_url: "https://gitlab.com/group/project/-/jobs/10", duration: 75 }]);
      if (target.includes("/merge_requests/42/commits")) return response([{ id: "0123456789abcdef0123456789abcdef01234567", short_id: "01234567", title: "Wire the job", author_name: "Carol", authored_date: "2026-08-21T09:50:00Z", web_url: "https://gitlab.com/group/project/-/commit/0123456789abcdef0123456789abcdef01234567" }]);
      return response({ description: "GitLab description" });
    }));

    const details = await getReviewDetails(parseReviewUrl("https://gitlab.com/group/project/-/merge_requests/42"));
    expect(details.description.value).toBe("GitLab description");
    expect(details.comments.value).toEqual([expect.objectContaining({ discussionId: "thread-1", author: "carol", resolved: false })]);
    expect(details.pipelines.value[0]).toMatchObject({ id: "9", status: "failed", duration: 120 });
    expect(details.checks.value[0]).toMatchObject({ name: "test", stage: "verify", status: "failed", duration: 75, source: "job" });
    expect(details.commits.value[0]).toMatchObject({
      shortSha: "01234567", subject: "Wire the job", author: "Carol",
      webUrl: "https://gitlab.com/group/project/-/commit/0123456789abcdef0123456789abcdef01234567",
    });
  });
});

describe("commit permalinks", () => {
  it("prefers the upstream url and otherwise derives one from the validated review url", () => {
    const github = parseReviewUrl("https://github.com/acme/demo/pull/7");
    const gitlab = parseReviewUrl("https://gitlab.com/group/project/-/merge_requests/42");
    expect(commitWebUrl(github, "abc123", "https://github.com/acme/demo/commit/abc123")).toBe("https://github.com/acme/demo/commit/abc123");
    expect(commitWebUrl(github, "abc123def", undefined)).toBe("https://github.com/acme/demo/commit/abc123def");
    expect(commitWebUrl(gitlab, "abc123def", undefined)).toBe("https://gitlab.com/group/project/-/commit/abc123def");
  });

  it("refuses non-http upstream urls and malformed revisions", () => {
    const github = parseReviewUrl("https://github.com/acme/demo/pull/7");
    expect(commitWebUrl(github, "abc123", "javascript:alert(1)")).toBe("https://github.com/acme/demo/commit/abc123");
    expect(commitWebUrl(github, "../../etc/passwd", undefined)).toBe("");
    expect(commitWebUrl(github, "", undefined)).toBe("");
  });
});

describe("revision-bound merge", () => {
  it.each([
    ["https://github.com/acme/demo/pull/7", "/pulls/7/merge"],
    ["https://gitlab.com/group/project/-/merge_requests/42", "/merge_requests/42/merge"],
  ])("sends the reviewed SHA for %s", async (reviewUrl, endpoint) => {
    const fetchMock = vi.fn(async () => response({ merged: true }));
    vi.stubGlobal("fetch", fetchMock);
    await mergeReview(parseReviewUrl(reviewUrl), "abc123");
    expect(String(fetchMock.mock.calls[0][0])).toContain(endpoint);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ sha: "abc123" }) });
  });
});
