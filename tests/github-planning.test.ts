import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPlanningIssue,
  getPlanningLabels,
  getPlanningSnapshot,
  normalizePlanningItem,
  PLANNING_LIMITS,
  planningErrorMessage,
  resetPlanningCache,
  validateCreatePlanningIssue,
} from "../server/github-planning.js";

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function rawItem(number: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: number,
    number,
    title: `Item ${number}`,
    state: "open",
    labels: [],
    user: { login: "octocat" },
    html_url: `https://github.com/leoncheng57/custom-dca-opencode/issues/${number}`,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-21T11:30:00Z",
    comments: 3,
    ...extra,
  };
}

afterEach(() => {
  resetPlanningCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GitHub planning normalization", () => {
  it("classifies issues and pull requests and keeps only label names", () => {
    expect(normalizePlanningItem(rawItem(1, {
      labels: [{ name: "frontend", color: "ff0000" }, "priority"],
    }))).toEqual(expect.objectContaining({
      number: 1,
      type: "issue",
      labels: ["frontend", "priority"],
      author: "octocat",
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-21T11:30:00Z",
      commentCount: 3,
    }));

    expect(normalizePlanningItem(rawItem(2, {
      state: "closed",
      pull_request: { merged_at: "2026-08-20T12:00:00Z" },
    }))).toEqual(expect.objectContaining({
      type: "pull_request",
      state: "closed",
      merged: true,
    }));
  });

  it("rejects records without a positive issue number and bounds external text", () => {
    expect(normalizePlanningItem(rawItem(0))).toBeNull();
    const normalized = normalizePlanningItem(rawItem(3, {
      title: "x".repeat(PLANNING_LIMITS.titleCharacters + 10),
      labels: Array.from({ length: PLANNING_LIMITS.labels + 5 }, (_, index) => ({ name: `label-${index}` })),
      html_url: "javascript:alert(1)",
    }));
    expect(normalized?.title).toHaveLength(PLANNING_LIMITS.titleCharacters);
    expect(normalized?.labels).toHaveLength(PLANNING_LIMITS.labels);
    expect(normalized?.url).toBe("");
  });
});

describe("GitHub planning fetch", () => {
  it("uses the fixed repository and bounds pagination with an explicit truncation flag", async () => {
    const fetchMock = vi.fn(async () => response(
      Array.from({ length: PLANNING_LIMITS.perPage }, (_, index) => rawItem(index + 1)),
      200,
      { Link: '<https://api.github.com/next>; rel="next"' },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getPlanningSnapshot();

    expect(fetchMock).toHaveBeenCalledTimes(PLANNING_LIMITS.pages);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/repos/leoncheng57/custom-dca-opencode/issues");
    expect(String(fetchMock.mock.calls[0][0])).toContain("state=all");
    expect(snapshot.items).toHaveLength(PLANNING_LIMITS.pages * PLANNING_LIMITS.perPage);
    expect(snapshot.truncated).toBe(true);
  });

  it("stops on a short page and sends the token only from the server", async () => {
    vi.stubEnv("GITHUB_TOKEN", "server-secret");
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer server-secret");
      return response([rawItem(1)]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getPlanningSnapshot();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.truncated).toBe(false);
  });

  it.each([
    [401, {}, "Authentication unavailable"],
    [403, {}, "Authentication unavailable"],
    [403, { "X-RateLimit-Remaining": "0" }, "Rate limited"],
    [429, {}, "Rate limited"],
    [500, {}, "Unavailable"],
  ] as const)("sanitizes HTTP %s without leaking the token or response body", async (status, headers, expected) => {
    vi.stubEnv("GITHUB_TOKEN", "must-never-leak");
    vi.stubGlobal("fetch", vi.fn(async () => response({ error: "upstream-secret-detail" }, status, headers)));

    const error = await getPlanningSnapshot().catch((reason: unknown) => reason);

    expect(planningErrorMessage(error)).toBe(expected);
    expect(String(error)).not.toContain("must-never-leak");
    expect(String(error)).not.toContain("upstream-secret-detail");
  });

  it("coalesces concurrent requests and caches the successful snapshot", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = getPlanningSnapshot();
    const second = getPlanningSnapshot();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(response([rawItem(1)]));

    const [a, b] = await Promise.all([first, second]);
    const cached = await getPlanningSnapshot();
    expect(a).toBe(b);
    expect(cached).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("GitHub planning issue creation", () => {
  it("strictly validates and normalizes create input", () => {
    expect(validateCreatePlanningIssue({ title: "  Ship it  ", body: "## Why", labels: ["frontend", "frontend", "mobile"] }))
      .toEqual({ title: "Ship it", body: "## Why", labels: ["frontend", "mobile"] });
    for (const invalid of [
      null,
      [],
      {},
      { title: "   " },
      { title: "line\nbreak" },
      { title: "ok", owner: "attacker" },
      { title: "ok", body: 1 },
      { title: "ok", labels: "frontend" },
      { title: "ok", labels: [1] },
      { title: "x".repeat(PLANNING_LIMITS.createTitleCharacters + 1) },
      { title: "ok", body: "x".repeat(PLANNING_LIMITS.createBodyCharacters + 1) },
    ]) expect(() => validateCreatePlanningIssue(invalid)).toThrow();
  });

  it("requires the server token without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createPlanningIssue({ title: "Test", body: "", labels: [] })).rejects.toThrow("Authentication unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts only bounded fields to the fixed repository and normalizes the result URL", async () => {
    vi.stubEnv("GITHUB_TOKEN", "server-secret");
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.github.com/repos/leoncheng57/custom-dca-opencode/issues");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer server-secret");
      expect(headers.get("user-agent")).toBe("custom-dca-opencode");
      expect(JSON.parse(String(init?.body))).toEqual({ title: "New issue", body: "Details", labels: ["frontend"] });
      return response(rawItem(123, { title: "New issue", html_url: "https://attacker.invalid/issue" }), 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    const issue = await createPlanningIssue({ title: "New issue", body: "Details", labels: ["frontend"] });

    expect(issue).toMatchObject({ number: 123, type: "issue", url: "https://github.com/leoncheng57/custom-dca-opencode/issues/123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, {}, "Authentication unavailable"],
    [403, { "Retry-After": "60" }, "Rate limited"],
    [422, {}, "Rejected by GitHub"],
    [500, {}, "Unavailable"],
  ] as const)("sanitizes create HTTP %s without retrying", async (status, headers, expected) => {
    vi.stubEnv("GITHUB_TOKEN", "must-never-leak");
    const fetchMock = vi.fn(async () => response({ secret: "upstream-body" }, status, headers));
    vi.stubGlobal("fetch", fetchMock);
    const error = await createPlanningIssue({ title: "Test", body: "", labels: [] }).catch((reason: unknown) => reason);
    expect(planningErrorMessage(error)).toBe(expected);
    expect(String(error)).not.toContain("must-never-leak");
    expect(String(error)).not.toContain("upstream-body");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads and caches label names and descriptions without colors", async () => {
    const fetchMock = vi.fn(async () => response([{ name: "frontend", description: "Client work", color: "ff0000" }]));
    vi.stubGlobal("fetch", fetchMock);
    const first = await getPlanningLabels();
    const second = await getPlanningLabels();
    expect(first).toEqual({ labels: [{ name: "frontend", description: "Client work" }], truncated: false });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates a warm snapshot only after successful creation", async () => {
    vi.stubEnv("GITHUB_TOKEN", "server-secret");
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") return response(rawItem(200), 201);
      reads += 1;
      return response([rawItem(reads)]);
    }));
    await getPlanningSnapshot();
    await getPlanningSnapshot();
    expect(reads).toBe(1);
    await createPlanningIssue({ title: "New", body: "", labels: [] });
    await getPlanningSnapshot();
    expect(reads).toBe(2);
  });
});
