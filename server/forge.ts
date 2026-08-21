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
  description: string;
  number: number;
  project: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
}

export interface ReviewJob {
  name: string;
  status: string;
  webUrl: string;
  duration: number | null;
}

export interface ReviewStage {
  name: string;
  status: string;
  jobs: ReviewJob[];
}

export interface ReviewPipeline {
  status: string;
  webUrl: string;
  stages: ReviewStage[];
}

interface DetailSection<T> {
  value: T;
  error: string | null;
}

export interface ReviewDetails {
  comments: DetailSection<ReviewComment[]>;
  pipeline: DetailSection<ReviewPipeline | null>;
  partial: boolean;
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

function githubApi(): URL {
  return new URL(process.env.GITHUB_API_URL || "https://api.github.com");
}

function gitlabApi(ref: Extract<ReviewRef, { forge: "gitlab" }>): URL {
  return new URL(`/api/v4/projects/${encodeURIComponent(ref.project)}/`, process.env.GITLAB_BASE_URL || "https://gitlab.com");
}

function githubPath(ref: Extract<ReviewRef, { forge: "github" }>): string {
  return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

export async function getReviewStatus(ref: ReviewRef): Promise<ReviewStatus> {
  if (ref.forge === "github") {
    const api = githubApi();
    const pr = await forgeFetch<Record<string, any>>(
      new URL(`${githubPath(ref)}/pulls/${ref.number}`, api),
      process.env.GITHUB_TOKEN,
    );
    let pipeline: string | null = null;
    if (typeof pr.head?.sha === "string") {
      const checks = await forgeFetch<{ check_runs?: Array<{ conclusion?: string; status?: string }> }>(
        new URL(`${githubPath(ref)}/commits/${pr.head.sha}/check-runs`, api),
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
      description: String(pr.body ?? ""),
      number: ref.number,
      project: `${ref.owner}/${ref.repo}`,
    };
  }

  const api = gitlabApi(ref);
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
    description: String(mr.description ?? ""),
    number: ref.number,
    project: ref.project,
  };
}

function normalizeCheckStatus(status?: string, conclusion?: string): string {
  if (status !== "completed") return status === "in_progress" ? "running" : "pending";
  if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped") return "success";
  if (conclusion === "cancelled") return "canceled";
  return "failed";
}

function stageStatus(statuses: string[]): string {
  for (const status of ["failed", "running", "pending", "canceled", "manual", "skipped"]) {
    if (statuses.includes(status)) return status;
  }
  return statuses.length > 0 && statuses.every((status) => status === "success") ? "success" : statuses[0] ?? "skipped";
}

async function getReviewComments(ref: ReviewRef): Promise<ReviewComment[]> {
  if (ref.forge === "github") {
    const comments = await forgeFetch<Array<Record<string, any>>>(
      new URL(`${githubPath(ref)}/issues/${ref.number}/comments?per_page=50`, githubApi()),
      process.env.GITHUB_TOKEN,
    );
    return comments.map((comment) => ({
      id: String(comment.id ?? ""),
      author: String(comment.user?.login ?? "unknown"),
      body: String(comment.body ?? ""),
      createdAt: String(comment.created_at ?? ""),
      resolved: false,
    }));
  }

  const discussions = await forgeFetch<Array<Record<string, any>>>(
    new URL(`merge_requests/${ref.number}/discussions?per_page=50`, gitlabApi(ref)),
    process.env.GITLAB_TOKEN,
  );
  return discussions
    .flatMap((discussion) => Array.isArray(discussion.notes) ? discussion.notes : [])
    .filter((note: Record<string, any>) => !note.system && !note.position)
    .map((note: Record<string, any>) => ({
      id: String(note.id ?? ""),
      author: String(note.author?.username ?? "unknown"),
      body: String(note.body ?? ""),
      createdAt: String(note.created_at ?? ""),
      resolved: Boolean(note.resolved),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(-50);
}

async function getReviewPipeline(ref: ReviewRef): Promise<ReviewPipeline | null> {
  if (ref.forge === "github") {
    const pr = await forgeFetch<Record<string, any>>(
      new URL(`${githubPath(ref)}/pulls/${ref.number}`, githubApi()),
      process.env.GITHUB_TOKEN,
    );
    if (typeof pr.head?.sha !== "string") return null;
    const checks = await forgeFetch<{ check_runs?: Array<Record<string, any>> }>(
      new URL(`${githubPath(ref)}/commits/${pr.head.sha}/check-runs?per_page=50`, githubApi()),
      process.env.GITHUB_TOKEN,
    );
    const jobs = (checks.check_runs ?? []).map((check) => {
      const started = Date.parse(String(check.started_at ?? ""));
      const completed = Date.parse(String(check.completed_at ?? ""));
      return {
        name: String(check.name ?? "Check"),
        status: normalizeCheckStatus(check.status, check.conclusion),
        webUrl: String(check.html_url ?? ""),
        duration: Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, (completed - started) / 1000) : null,
      };
    });
    if (jobs.length === 0) return null;
    const status = stageStatus(jobs.map((job) => job.status));
    return {
      status,
      webUrl: `${ref.url.replace(/\/$/, "")}/checks`,
      stages: [{ name: "checks", status, jobs }],
    };
  }

  const api = gitlabApi(ref);
  const pipelines = await forgeFetch<Array<Record<string, any>>>(
    new URL(`merge_requests/${ref.number}/pipelines`, api),
    process.env.GITLAB_TOKEN,
  );
  const latest = pipelines[0];
  if (!latest?.id) return null;
  const jobs = await forgeFetch<Array<Record<string, any>>>(
    new URL(`pipelines/${latest.id}/jobs?per_page=100`, api),
    process.env.GITLAB_TOKEN,
  );
  const stages = new Map<string, ReviewJob[]>();
  for (const job of jobs) {
    const name = String(job.stage ?? "pipeline");
    const item = {
      name: String(job.name ?? "Job"),
      status: String(job.status ?? "unknown"),
      webUrl: String(job.web_url ?? ""),
      duration: typeof job.duration === "number" ? job.duration : null,
    };
    stages.set(name, [...(stages.get(name) ?? []), item]);
  }
  return {
    status: String(latest.status ?? "unknown"),
    webUrl: String(latest.web_url ?? ""),
    stages: [...stages].map(([name, jobs]) => ({ name, status: stageStatus(jobs.map((job) => job.status)), jobs })),
  };
}

function detailSection<T>(result: PromiseSettledResult<T>, fallback: T): DetailSection<T> {
  return result.status === "fulfilled"
    ? { value: result.value, error: null }
    : { value: fallback, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
}

export async function getReviewDetails(ref: ReviewRef): Promise<ReviewDetails> {
  const [commentsResult, pipelineResult] = await Promise.allSettled([
    getReviewComments(ref),
    getReviewPipeline(ref),
  ]);
  return {
    comments: detailSection(commentsResult, []),
    pipeline: detailSection(pipelineResult, null),
    partial: commentsResult.status === "rejected" || pipelineResult.status === "rejected",
  };
}

export async function mergeReview(ref: ReviewRef, expectedSha: string): Promise<void> {
  if (!/^[a-f0-9]{6,64}$/i.test(expectedSha)) throw new Error("a reviewed head SHA is required");
  if (ref.forge === "github") {
    await forgeFetch(new URL(`${githubPath(ref)}/pulls/${ref.number}/merge`, githubApi()), process.env.GITHUB_TOKEN, "PUT", { sha: expectedSha });
    return;
  }
  const api = new URL(`/api/v4/projects/${encodeURIComponent(ref.project)}/merge_requests/${ref.number}/merge`, process.env.GITLAB_BASE_URL || "https://gitlab.com");
  await forgeFetch(api, process.env.GITLAB_TOKEN, "PUT", { sha: expectedSha });
}
