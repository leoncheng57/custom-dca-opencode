export type ReviewRef =
  | { forge: "github"; url: string; owner: string; repo: string; number: number }
  | { forge: "gitlab"; url: string; project: string; number: number };

export interface ReviewStatus {
  url: string;
  forge: "github" | "gitlab";
  title: string;
  state: string;
  author: string;
  pipeline: string | null;
  mergeable: boolean | null;
  headSha: string;
}

function gitlabOrigin(): string {
  return new URL(process.env.GITLAB_BASE_URL || "https://gitlab.com").origin;
}

export function parseReviewUrl(value: string): ReviewRef {
  const url = new URL(value);
  const github = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(url.pathname);
  if (url.origin === "https://github.com" && github) {
    return { forge: "github", url: url.toString(), owner: github[1], repo: github[2], number: Number(github[3]) };
  }
  const marker = "/-/merge_requests/";
  if (url.origin === gitlabOrigin() && url.pathname.includes(marker)) {
    const [project, suffix] = url.pathname.split(marker);
    if (project && /^\d+\/?$/.test(suffix)) {
      return { forge: "gitlab", url: url.toString(), project: project.replace(/^\//, ""), number: Number(suffix.replace("/", "")) };
    }
  }
  throw new Error("only GitHub pull-request and configured GitLab merge-request URLs are supported");
}

async function forgeFetch<T>(url: URL, token: string | undefined, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`forge returned HTTP ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function getReviewStatus(ref: ReviewRef): Promise<ReviewStatus> {
  if (ref.forge === "github") {
    const api = new URL(process.env.GITHUB_API_URL || "https://api.github.com");
    const pr = await forgeFetch<Record<string, any>>(
      new URL(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`, api),
      process.env.GITHUB_TOKEN,
    );
    let pipeline: string | null = null;
    if (typeof pr.head?.sha === "string") {
      const checks = await forgeFetch<{ check_runs?: Array<{ conclusion?: string; status?: string }> }>(
        new URL(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/commits/${pr.head.sha}/check-runs`, api),
        process.env.GITHUB_TOKEN,
      ).catch(() => ({ check_runs: [] }));
      const states = (checks.check_runs ?? []).map((check) => check.conclusion ?? check.status ?? "unknown");
      const pending = states.some((state) => ["in_progress", "queued", "pending", "requested", "waiting"].includes(state));
      const passed = states.length > 0 && states.every((state) => ["success", "neutral", "skipped"].includes(state));
      pipeline = pending ? "running" : passed ? "passed" : states.length ? "failed" : null;
    }
    return {
      url: ref.url,
      forge: "github",
      title: String(pr.title ?? "Pull request"),
      state: String(pr.state ?? "unknown"),
      author: String(pr.user?.login ?? "unknown"),
      pipeline,
      mergeable: typeof pr.mergeable === "boolean" ? pr.mergeable : null,
      headSha: String(pr.head?.sha ?? ""),
    };
  }

  const api = new URL(`/api/v4/projects/${encodeURIComponent(ref.project)}/`, process.env.GITLAB_BASE_URL || "https://gitlab.com");
  const token = process.env.GITLAB_TOKEN;
  const mr = await forgeFetch<Record<string, any>>(new URL(`merge_requests/${ref.number}`, api), token);
  const pipelines = await forgeFetch<Array<{ status?: string }>>(new URL(`merge_requests/${ref.number}/pipelines`, api), token).catch(() => []);
  return {
    url: ref.url,
    forge: "gitlab",
    title: String(mr.title ?? "Merge request"),
    state: String(mr.state ?? "unknown"),
    author: String(mr.author?.username ?? "unknown"),
    pipeline: pipelines[0]?.status ?? null,
    mergeable: mr.merge_status === "can_be_merged" ? true : mr.merge_status ? false : null,
    headSha: String(mr.sha ?? ""),
  };
}

export async function mergeReview(ref: ReviewRef, expectedSha: string): Promise<void> {
  if (!/^[a-f0-9]{6,64}$/i.test(expectedSha)) throw new Error("a reviewed head SHA is required");
  if (ref.forge === "github") {
    const api = new URL(process.env.GITHUB_API_URL || "https://api.github.com");
    await forgeFetch(new URL(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}/merge`, api), process.env.GITHUB_TOKEN, "PUT", { sha: expectedSha });
    return;
  }
  const api = new URL(`/api/v4/projects/${encodeURIComponent(ref.project)}/merge_requests/${ref.number}/merge`, process.env.GITLAB_BASE_URL || "https://gitlab.com");
  await forgeFetch(api, process.env.GITLAB_TOKEN, "PUT", { sha: expectedSha });
}
