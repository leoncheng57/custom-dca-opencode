import type { ReviewRef } from "./forge.js";

export const REVIEW_DETAIL_LIMITS = {
  bodyCharacters: 8_000,
  subjectCharacters: 500,
  comments: 50,
  reviews: 25,
  pipelines: 5,
  checks: 100,
  commits: 50,
  pages: 1,
  timeoutMs: 10_000,
} as const;

type ItemStatus = "passed" | "failed" | "running" | "pending" | "canceled" | "skipped" | "unknown";
type SafeError = "Authentication unavailable" | "Rate limited" | "Unavailable";

export interface DetailSection<T> { value: T; error: SafeError | null; truncated: boolean }
export interface ReviewComment { id: string; author: string; body: string; createdAt: string; resolved: boolean | null; discussionId: string | null; bodyTruncated: boolean }
export interface ReviewSummary { id: string; author: string; state: string; body: string; submittedAt: string; bodyTruncated: boolean }
export interface ReviewPipeline { id: string; status: ItemStatus; webUrl: string; createdAt: string; completedAt: string; duration: number | null }
export interface ReviewCheck { id: string; name: string; stage: string; status: ItemStatus; webUrl: string; startedAt: string; completedAt: string; duration: number | null; source: "check" | "status" | "job" }
export interface ReviewCommit { sha: string; shortSha: string; subject: string; author: string; authoredAt: string; webUrl: string; subjectTruncated: boolean }
export interface ReviewDetails {
  comments: DetailSection<ReviewComment[]>;
  reviews: DetailSection<ReviewSummary[]>;
  pipelines: DetailSection<ReviewPipeline[]>;
  checks: DetailSection<ReviewCheck[]>;
  commits: DetailSection<ReviewCommit[]>;
  partial: boolean;
  auth: "available" | "unavailable" | "rate_limited";
}

class DetailError extends Error {
  constructor(readonly status: number | null) { super(); }
}

function token(ref: ReviewRef): string | undefined {
  return ref.forge === "github" ? process.env.GITHUB_TOKEN : process.env.GITLAB_TOKEN;
}

function githubBase(): URL { return new URL(process.env.GITHUB_API_URL || "https://api.github.com"); }
function gitlabBase(ref: Extract<ReviewRef, { forge: "gitlab" }>): URL {
  return new URL(`/api/v4/projects/${encodeURIComponent(ref.project)}/`, process.env.GITLAB_BASE_URL || "https://gitlab.com");
}

function url(path: string, base: URL, query?: Record<string, string>): URL {
  const result = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) result.searchParams.set(key, value);
  return result;
}

async function get<T>(target: URL, auth: string | undefined): Promise<T> {
  let response: Response;
  try {
    response = await fetch(target, {
      headers: { Accept: "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      redirect: "error",
      signal: AbortSignal.timeout(REVIEW_DETAIL_LIMITS.timeoutMs),
    });
  } catch {
    throw new DetailError(null);
  }
  if (!response.ok) throw new DetailError(response.status);
  try { return await response.json() as T; }
  catch { throw new DetailError(response.status); }
}

function safeError(error: unknown): SafeError {
  if (error instanceof DetailError && error.status === 429) return "Rate limited";
  if (error instanceof DetailError && (error.status === 401 || error.status === 403)) return "Authentication unavailable";
  return "Unavailable";
}

function text(value: unknown, max: number): { value: string; truncated: boolean } {
  const source = typeof value === "string" ? value : "";
  return { value: source.slice(0, max), truncated: source.length > max };
}

function subject(value: unknown, max: number): { value: string; truncated: boolean } {
  const line = (typeof value === "string" ? value : "").split("\n", 1)[0] ?? "";
  return { value: line.slice(0, max), truncated: line.length > max };
}

/** Deterministic commit permalink, so a missing upstream `html_url`/`web_url` never costs the reader the diff link. */
export function commitWebUrl(ref: ReviewRef, sha: string, reported: unknown): string {
  if (typeof reported === "string" && /^https?:\/\//i.test(reported)) return reported;
  if (!/^[a-f0-9]{6,64}$/i.test(sha)) return "";
  return ref.forge === "github"
    ? ref.url.replace(/\/pull\/\d+\/?$/, `/commit/${sha}`)
    : ref.url.replace(/\/-\/merge_requests\/\d+\/?$/, `/-/commit/${sha}`);
}

export function detailDuration(start: unknown, end: unknown, reported?: unknown): number | null {
  if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) return reported;
  if (typeof start !== "string" || typeof end !== "string") return null;
  const from = Date.parse(start);
  const to = Date.parse(end);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? (to - from) / 1_000 : null;
}

export function normalizeDetailStatus(value: unknown): ItemStatus {
  const status = String(value ?? "").toLowerCase();
  if (["success", "succeeded", "passed", "neutral"].includes(status)) return "passed";
  if (["failure", "failed", "error", "timed_out", "action_required"].includes(status)) return "failed";
  if (["running", "in_progress", "waiting"].includes(status)) return "running";
  if (["pending", "queued", "requested", "created", "preparing", "scheduled", "manual"].includes(status)) return "pending";
  if (["cancelled", "canceled"].includes(status)) return "canceled";
  if (["skipped", "stale"].includes(status)) return "skipped";
  return "unknown";
}

function failedSection<T>(fallback: T, error: unknown): DetailSection<T> {
  return { value: fallback, error: safeError(error), truncated: false };
}

function authState(ref: ReviewRef, errors: unknown[]): ReviewDetails["auth"] {
  if (errors.some((error) => error instanceof DetailError && error.status === 429)) return "rate_limited";
  if (!token(ref) || errors.some((error) => error instanceof DetailError && (error.status === 401 || error.status === 403))) return "unavailable";
  return "available";
}

async function githubDetails(ref: Extract<ReviewRef, { forge: "github" }>): Promise<ReviewDetails> {
  const auth = token(ref);
  const base = githubBase();
  const repo = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const initial = await Promise.allSettled([
    get<Record<string, any>>(url(`${repo}/pulls/${ref.number}`, base), auth),
    get<Array<Record<string, any>>>(url(`${repo}/issues/${ref.number}/comments`, base, { per_page: "51", page: "1" }), auth),
    get<Array<Record<string, any>>>(url(`${repo}/pulls/${ref.number}/reviews`, base, { per_page: "26", page: "1" }), auth),
    get<Array<Record<string, any>>>(url(`${repo}/pulls/${ref.number}/commits`, base, { per_page: String(REVIEW_DETAIL_LIMITS.commits + 1), page: "1" }), auth),
  ]);
  const errors = initial.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason);
  const pr = initial[0];
  const commentsResult = initial[1];
  const reviewsResult = initial[2];
  const commitsResult = initial[3];
  const comments = commentsResult.status === "fulfilled" ? {
    value: commentsResult.value.slice(0, REVIEW_DETAIL_LIMITS.comments).map((comment) => {
      const body = text(comment.body, REVIEW_DETAIL_LIMITS.bodyCharacters);
      return { id: String(comment.id ?? ""), author: String(comment.user?.login ?? "unknown"), body: body.value, createdAt: String(comment.created_at ?? ""), resolved: null, discussionId: null, bodyTruncated: body.truncated };
    }), error: null, truncated: commentsResult.value.length > REVIEW_DETAIL_LIMITS.comments,
  } satisfies DetailSection<ReviewComment[]> : failedSection<ReviewComment[]>([], commentsResult.reason);
  const reviews = reviewsResult.status === "fulfilled" ? {
    value: reviewsResult.value.slice(0, REVIEW_DETAIL_LIMITS.reviews).map((review) => {
      const body = text(review.body, REVIEW_DETAIL_LIMITS.bodyCharacters);
      return { id: String(review.id ?? ""), author: String(review.user?.login ?? "unknown"), state: String(review.state ?? "unknown").toLowerCase(), body: body.value, submittedAt: String(review.submitted_at ?? ""), bodyTruncated: body.truncated };
    }), error: null, truncated: reviewsResult.value.length > REVIEW_DETAIL_LIMITS.reviews,
  } satisfies DetailSection<ReviewSummary[]> : failedSection<ReviewSummary[]>([], reviewsResult.reason);
  const commitList = commitsResult.status === "fulfilled" && Array.isArray(commitsResult.value) ? commitsResult.value : [];
  const commits = commitsResult.status === "fulfilled" ? {
    value: commitList.slice(0, REVIEW_DETAIL_LIMITS.commits).map((commit) => {
      const sha = String(commit.sha ?? "");
      const line = subject(commit.commit?.message, REVIEW_DETAIL_LIMITS.subjectCharacters);
      return { sha, shortSha: sha.slice(0, 7), subject: line.value, author: String(commit.author?.login ?? commit.commit?.author?.name ?? "unknown"), authoredAt: String(commit.commit?.author?.date ?? ""), webUrl: commitWebUrl(ref, sha, commit.html_url), subjectTruncated: line.truncated };
    }), error: null, truncated: commitList.length > REVIEW_DETAIL_LIMITS.commits,
  } satisfies DetailSection<ReviewCommit[]> : failedSection<ReviewCommit[]>([], commitsResult.reason);

  let checks: DetailSection<ReviewCheck[]> = { value: [], error: null, truncated: false };
  const sha = pr.status === "fulfilled" && typeof pr.value.head?.sha === "string" ? pr.value.head.sha : "";
  if (!sha) {
    checks = failedSection([], pr.status === "rejected" ? pr.reason : new DetailError(null));
  } else {
    const checkResults = await Promise.allSettled([
      get<{ total_count?: number; check_runs?: Array<Record<string, any>> }>(url(`${repo}/commits/${sha}/check-runs`, base, { per_page: "100", page: "1" }), auth),
      get<{ total_count?: number; statuses?: Array<Record<string, any>> }>(url(`${repo}/commits/${sha}/status`, base, { per_page: "100", page: "1" }), auth),
    ]);
    errors.push(...checkResults.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason));
    const items: ReviewCheck[] = [];
    let truncated = false;
    if (checkResults[0].status === "fulfilled") {
      const runs = checkResults[0].value.check_runs ?? [];
      truncated ||= Number(checkResults[0].value.total_count ?? runs.length) > REVIEW_DETAIL_LIMITS.checks;
      for (const run of runs) items.push({ id: `check:${String(run.id ?? items.length)}`, name: String(run.name ?? "Check"), stage: String(run.app?.name ?? "checks"), status: normalizeDetailStatus(run.status === "completed" ? run.conclusion : run.status), webUrl: String(run.details_url ?? run.html_url ?? ""), startedAt: String(run.started_at ?? ""), completedAt: String(run.completed_at ?? ""), duration: detailDuration(run.started_at, run.completed_at), source: "check" });
    }
    if (checkResults[1].status === "fulfilled") {
      const statuses = checkResults[1].value.statuses ?? [];
      truncated ||= Number(checkResults[1].value.total_count ?? statuses.length) + items.length > REVIEW_DETAIL_LIMITS.checks;
      for (const status of statuses) items.push({ id: `status:${String(status.id ?? items.length)}`, name: String(status.context ?? "Status"), stage: "status contexts", status: normalizeDetailStatus(status.state), webUrl: String(status.target_url ?? ""), startedAt: String(status.created_at ?? ""), completedAt: String(status.updated_at ?? ""), duration: detailDuration(status.created_at, status.updated_at), source: "status" });
    }
    checks = { value: items.slice(0, REVIEW_DETAIL_LIMITS.checks), error: checkResults.some((item) => item.status === "rejected") ? "Unavailable" : null, truncated: truncated || items.length > REVIEW_DETAIL_LIMITS.checks };
  }
  const pipelines: DetailSection<ReviewPipeline[]> = { value: [], error: null, truncated: false };
  const sections = [comments, reviews, pipelines, checks, commits];
  return { comments, reviews, pipelines, checks, commits, partial: sections.some((section) => section.error !== null), auth: authState(ref, errors) };
}

async function gitlabDetails(ref: Extract<ReviewRef, { forge: "gitlab" }>): Promise<ReviewDetails> {
  const auth = token(ref);
  const base = gitlabBase(ref);
  const initial = await Promise.allSettled([
    get<Record<string, any>>(url(`merge_requests/${ref.number}`, base), auth),
    get<Array<Record<string, any>>>(url(`merge_requests/${ref.number}/discussions`, base, { per_page: "51", page: "1" }), auth),
    get<Array<Record<string, any>>>(url(`merge_requests/${ref.number}/pipelines`, base, { per_page: "6", page: "1" }), auth),
    get<Array<Record<string, any>>>(url(`merge_requests/${ref.number}/commits`, base, { per_page: String(REVIEW_DETAIL_LIMITS.commits + 1), page: "1" }), auth),
  ]);
  const errors = initial.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason);
  let comments: DetailSection<ReviewComment[]>;
  if (initial[1].status === "fulfilled") {
    const items: ReviewComment[] = [];
    for (const discussion of initial[1].value) for (const note of Array.isArray(discussion.notes) ? discussion.notes : []) {
      if (note.system) continue;
      const body = text(note.body, REVIEW_DETAIL_LIMITS.bodyCharacters);
      items.push({ id: String(note.id ?? ""), author: String(note.author?.username ?? "unknown"), body: body.value, createdAt: String(note.created_at ?? ""), resolved: typeof note.resolved === "boolean" ? note.resolved : null, discussionId: String(discussion.id ?? "") || null, bodyTruncated: body.truncated });
    }
    comments = { value: items.slice(0, REVIEW_DETAIL_LIMITS.comments), error: null, truncated: initial[1].value.length > REVIEW_DETAIL_LIMITS.comments || items.length > REVIEW_DETAIL_LIMITS.comments };
  } else comments = failedSection([], initial[1].reason);
  const reviews: DetailSection<ReviewSummary[]> = { value: [], error: null, truncated: false };
  let pipelines: DetailSection<ReviewPipeline[]>;
  let latestId: number | null = null;
  if (initial[2].status === "fulfilled") {
    latestId = typeof initial[2].value[0]?.id === "number" ? initial[2].value[0].id : null;
    pipelines = { value: initial[2].value.slice(0, REVIEW_DETAIL_LIMITS.pipelines).map((pipeline) => ({ id: String(pipeline.id ?? ""), status: normalizeDetailStatus(pipeline.status), webUrl: String(pipeline.web_url ?? ""), createdAt: String(pipeline.created_at ?? ""), completedAt: String(pipeline.updated_at ?? ""), duration: detailDuration(pipeline.created_at, pipeline.updated_at) })), error: null, truncated: initial[2].value.length > REVIEW_DETAIL_LIMITS.pipelines };
  } else pipelines = failedSection([], initial[2].reason);
  const commitList = initial[3].status === "fulfilled" && Array.isArray(initial[3].value) ? initial[3].value : [];
  const commits = initial[3].status === "fulfilled" ? {
    value: commitList.slice(0, REVIEW_DETAIL_LIMITS.commits).map((commit) => {
      const sha = String(commit.id ?? "");
      const line = subject(commit.title ?? commit.message, REVIEW_DETAIL_LIMITS.subjectCharacters);
      return { sha, shortSha: String(commit.short_id ?? sha.slice(0, 8)), subject: line.value, author: String(commit.author_name ?? "unknown"), authoredAt: String(commit.authored_date ?? commit.created_at ?? ""), webUrl: commitWebUrl(ref, sha, commit.web_url), subjectTruncated: line.truncated };
    }), error: null, truncated: commitList.length > REVIEW_DETAIL_LIMITS.commits,
  } satisfies DetailSection<ReviewCommit[]> : failedSection<ReviewCommit[]>([], initial[3].reason);
  let checks: DetailSection<ReviewCheck[]> = { value: [], error: null, truncated: false };
  if (latestId !== null) {
    try {
      const jobs = await get<Array<Record<string, any>>>(url(`pipelines/${latestId}/jobs`, base, { per_page: "100", page: "1" }), auth);
      checks = { value: jobs.slice(0, REVIEW_DETAIL_LIMITS.checks).map((job) => ({ id: `job:${String(job.id ?? "")}`, name: String(job.name ?? "Job"), stage: String(job.stage ?? "pipeline"), status: normalizeDetailStatus(job.status), webUrl: String(job.web_url ?? ""), startedAt: String(job.started_at ?? ""), completedAt: String(job.finished_at ?? ""), duration: detailDuration(job.started_at, job.finished_at, job.duration), source: "job" })), error: null, truncated: jobs.length >= REVIEW_DETAIL_LIMITS.checks };
    } catch (error) { errors.push(error); checks = failedSection([], error); }
  }
  const sections = [comments, reviews, pipelines, checks, commits];
  return { comments, reviews, pipelines, checks, commits, partial: sections.some((section) => section.error !== null), auth: authState(ref, errors) };
}

const inFlight = new Map<string, Promise<ReviewDetails>>();

export function getReviewDetails(ref: ReviewRef): Promise<ReviewDetails> {
  const current = inFlight.get(ref.url);
  if (current) return current;
  const request = (ref.forge === "github" ? githubDetails(ref) : gitlabDetails(ref)).finally(() => inFlight.delete(ref.url));
  inFlight.set(ref.url, request);
  return request;
}
