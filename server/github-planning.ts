// server/github-planning.ts — planning feed and issue creation for ONE fixed repository.
//
// This is deliberately not project-scoped. Every other instance route threads
// ?directory=, but the planning page is a developer page about *this* app, so the
// repository is a constant here and the browser cannot name one. That removes the
// whole class of "browser points the server's token at an arbitrary repo" bugs
// that the existing forge routes are exposed to, since they authorize by URL.
//
// GitHub's Issues API returns pull requests too (a PR is an issue with a
// `pull_request` member). We keep both and label them, because the planning view
// wants one backlog, but the distinction has to survive normalization.

export const PLANNING_REPOSITORY = {
  owner: "leoncheng57",
  repo: "custom-dca-opencode",
  url: "https://github.com/leoncheng57/custom-dca-opencode",
} as const;

export const PLANNING_LIMITS = {
  perPage: 100,
  /** Bounded fan-out: at most 500 records, then we report truncation. */
  pages: 5,
  labels: 20,
  titleCharacters: 300,
  timeoutMs: 10_000,
  cacheMs: 60_000,
  labelCacheMs: 5 * 60_000,
  createTitleCharacters: 256,
  createBodyCharacters: 65_536,
  labelNameCharacters: 100,
} as const;

export type PlanningItemType = "issue" | "pull_request";
export type PlanningItemState = "open" | "closed";
export type PlanningError = "Authentication unavailable" | "Rate limited" | "Rejected by GitHub" | "Unavailable";

export interface PlanningLabel { name: string; description: string | null }
export interface CreatePlanningIssueInput { title: string; body: string; labels: string[] }

export class PlanningInputError extends Error {}

export interface PlanningItem {
  id: string;
  number: number;
  type: PlanningItemType;
  title: string;
  state: PlanningItemState;
  /** Only ever true for a merged pull request. */
  merged: boolean;
  /** Label *names* only — see planningErrorMessage's note on colors. */
  labels: string[];
  author: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
}

export interface PlanningSnapshot {
  repository: { owner: string; repo: string; url: string };
  items: PlanningItem[];
  /** True when more records exist than PLANNING_LIMITS allows us to fetch. */
  truncated: boolean;
  fetchedAt: string;
}

class PlanningFetchError extends Error {
  constructor(readonly safeMessage: PlanningError, readonly status: number) {
    super(safeMessage);
  }
}

/**
 * Upstream failures are reduced to three coarse strings. The token and any raw
 * upstream body must never reach the browser, and the caller only needs to know
 * whether to retry, re-authenticate, or wait.
 */
export function planningErrorMessage(error: unknown): PlanningError {
  return error instanceof PlanningFetchError ? error.safeMessage : "Unavailable";
}

export function planningErrorStatus(error: unknown): number {
  return error instanceof PlanningFetchError ? error.status : 502;
}

function githubApi(): URL {
  return new URL(process.env.GITHUB_API_URL || "https://api.github.com");
}

function pageUrl(page: number): URL {
  const url = new URL(
    `/repos/${encodeURIComponent(PLANNING_REPOSITORY.owner)}/${encodeURIComponent(PLANNING_REPOSITORY.repo)}/issues`,
    githubApi(),
  );
  url.searchParams.set("state", "all");
  url.searchParams.set("per_page", String(PLANNING_LIMITS.perPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");
  return url;
}

function labelsUrl(page: number): URL {
  const url = new URL(
    `/repos/${encodeURIComponent(PLANNING_REPOSITORY.owner)}/${encodeURIComponent(PLANNING_REPOSITORY.repo)}/labels`,
    githubApi(),
  );
  url.searchParams.set("per_page", String(PLANNING_LIMITS.perPage));
  url.searchParams.set("page", String(page));
  return url;
}

function createUrl(): URL {
  return new URL(
    `/repos/${encodeURIComponent(PLANNING_REPOSITORY.owner)}/${encodeURIComponent(PLANNING_REPOSITORY.repo)}/issues`,
    githubApi(),
  );
}

/**
 * GitHub signals an exhausted rate limit with 403 plus a zero remaining header
 * far more often than with 429, so both have to map to "Rate limited" or the UI
 * tells the user to fix their credentials when they only need to wait.
 */
function classifiedError(response: Response): PlanningFetchError {
  if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) {
    return new PlanningFetchError("Rate limited", 429);
  }
  if (response.status === 401 || response.status === 403) return new PlanningFetchError("Authentication unavailable", 503);
  if (response.status === 400 || response.status === 422) return new PlanningFetchError("Rejected by GitHub", 422);
  return new PlanningFetchError("Unavailable", 502);
}

interface PlanningPage {
  items: Array<Record<string, unknown>>;
  hasNext: boolean;
}

async function fetchPage(page: number): Promise<PlanningPage> {
  const token = process.env.GITHUB_TOKEN;
  let response: Response;
  try {
    response = await fetch(pageUrl(page), {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "custom-dca-opencode",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(PLANNING_LIMITS.timeoutMs),
    });
  } catch {
    throw new PlanningFetchError("Unavailable", 502);
  }
  if (!response.ok) throw classifiedError(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PlanningFetchError("Unavailable", 502);
  }
  if (!Array.isArray(body)) throw new PlanningFetchError("Unavailable", 502);
  const link = response.headers.get("link") ?? "";
  return {
    items: body as Array<Record<string, unknown>>,
    hasNext: /(?:^|,)\s*<[^>]+>;\s*rel="next"(?:\s*[,;]|$)/u.test(link),
  };
}

async function fetchLabelsPage(page: number): Promise<PlanningPage> {
  let response: Response;
  try {
    response = await fetch(labelsUrl(page), {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "custom-dca-opencode",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(PLANNING_LIMITS.timeoutMs),
    });
  } catch {
    throw new PlanningFetchError("Unavailable", 502);
  }
  if (!response.ok) throw classifiedError(response);
  let body: unknown;
  try { body = await response.json(); } catch { throw new PlanningFetchError("Unavailable", 502); }
  if (!Array.isArray(body)) throw new PlanningFetchError("Unavailable", 502);
  return {
    items: body as Array<Record<string, unknown>>,
    hasNext: /(?:^|,)\s*<[^>]+>;\s*rel="next"(?:\s*[,;]|$)/u.test(response.headers.get("link") ?? ""),
  };
}

export function validateCreatePlanningIssue(value: unknown): CreatePlanningIssueInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlanningInputError("Issue must be an object");
  const source = value as Record<string, unknown>;
  const allowed = new Set(["title", "body", "labels"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) throw new PlanningInputError("Issue contains an unknown field");
  if (typeof source.title !== "string") throw new PlanningInputError("Title is required");
  const title = source.title.trim();
  if (!title) throw new PlanningInputError("Title is required");
  if (title.length > PLANNING_LIMITS.createTitleCharacters) throw new PlanningInputError(`Title must be ${PLANNING_LIMITS.createTitleCharacters} characters or fewer`);
  if (/[\r\n\0]/u.test(title)) throw new PlanningInputError("Title must be one line");
  if (source.body !== undefined && typeof source.body !== "string") throw new PlanningInputError("Description must be text");
  const body = String(source.body ?? "");
  if (body.length > PLANNING_LIMITS.createBodyCharacters || body.includes("\0")) throw new PlanningInputError("Description is invalid or too long");
  if (source.labels !== undefined && !Array.isArray(source.labels)) throw new PlanningInputError("Labels must be a list");
  const labels: string[] = [];
  for (const raw of (source.labels ?? []) as unknown[]) {
    if (typeof raw !== "string") throw new PlanningInputError("Every label must be text");
    const label = raw.trim();
    if (!label || label.length > PLANNING_LIMITS.labelNameCharacters) throw new PlanningInputError("Label is invalid or too long");
    if (!labels.includes(label)) labels.push(label);
    if (labels.length > PLANNING_LIMITS.labels) throw new PlanningInputError(`At most ${PLANNING_LIMITS.labels} labels may be selected`);
  }
  return { title, body, labels };
}

function labelNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const entry of value) {
    const name = typeof entry === "string" ? entry : String((entry as { name?: unknown } | null)?.name ?? "");
    if (name) names.push(name);
    if (names.length >= PLANNING_LIMITS.labels) break;
  }
  return names;
}

/** Only http(s) survives, so the client can link without re-validating. */
function webUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizePlanningItem(raw: Record<string, unknown>): PlanningItem | null {
  const number = Number(raw.number);
  if (!Number.isSafeInteger(number) || number <= 0) return null;

  const pull = raw.pull_request;
  const isPull = !!pull && typeof pull === "object";
  const mergedAt = isPull ? (pull as { merged_at?: unknown }).merged_at : undefined;
  const title = String(raw.title ?? "");

  return {
    id: String(raw.id ?? `${isPull ? "pull" : "issue"}-${number}`),
    number,
    type: isPull ? "pull_request" : "issue",
    title: title.slice(0, PLANNING_LIMITS.titleCharacters),
    state: raw.state === "closed" ? "closed" : "open",
    merged: isPull && typeof mergedAt === "string" && mergedAt.length > 0,
    labels: labelNames(raw.labels),
    author: typeof (raw.user as { login?: unknown } | null)?.login === "string"
      ? String((raw.user as { login: string }).login)
      : null,
    url: webUrl(raw.html_url),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    commentCount: Number.isFinite(Number(raw.comments)) ? Math.max(0, Math.trunc(Number(raw.comments))) : 0,
  };
}

async function loadSnapshot(): Promise<PlanningSnapshot> {
  const items: PlanningItem[] = [];
  let truncated = false;
  for (let page = 1; page <= PLANNING_LIMITS.pages; page += 1) {
    const result = await fetchPage(page);
    for (const entry of result.items) {
      const item = normalizePlanningItem(entry);
      if (item) items.push(item);
    }
    if (!result.hasNext) break;
    if (page === PLANNING_LIMITS.pages) truncated = true;
  }
  return { repository: { ...PLANNING_REPOSITORY }, items, truncated, fetchedAt: new Date().toISOString() };
}

let cached: { snapshot: PlanningSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<PlanningSnapshot> | null = null;
let cacheGeneration = 0;
let labelsCached: { labels: PlanningLabel[]; truncated: boolean; expiresAt: number } | null = null;
let labelsInFlight: Promise<{ labels: PlanningLabel[]; truncated: boolean }> | null = null;

/** Tests only. Module-level cache would otherwise leak between cases. */
export function resetPlanningCache(): void {
  cached = null;
  inFlight = null;
  cacheGeneration += 1;
  labelsCached = null;
  labelsInFlight = null;
}

/**
 * Cached for PLANNING_LIMITS.cacheMs and coalesced while in flight: the page
 * polls, and several browser tabs must not multiply into several GitHub calls
 * against a shared rate limit.
 */
export function getPlanningSnapshot(refresh = false): Promise<PlanningSnapshot> {
  if (!refresh && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.snapshot);
  if (inFlight) return inFlight;
  const generation = cacheGeneration;
  const request = loadSnapshot()
    .then((snapshot) => {
      if (generation === cacheGeneration) cached = { snapshot, expiresAt: Date.now() + PLANNING_LIMITS.cacheMs };
      return snapshot;
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}

async function loadLabels(): Promise<{ labels: PlanningLabel[]; truncated: boolean }> {
  const labels: PlanningLabel[] = [];
  let truncated = false;
  for (let page = 1; page <= PLANNING_LIMITS.pages; page += 1) {
    const result = await fetchLabelsPage(page);
    for (const raw of result.items) {
      const name = typeof raw.name === "string" ? raw.name : "";
      if (name) labels.push({ name, description: typeof raw.description === "string" ? raw.description : null });
    }
    if (!result.hasNext) break;
    if (page === PLANNING_LIMITS.pages) truncated = true;
  }
  return { labels, truncated };
}

export function getPlanningLabels(): Promise<{ labels: PlanningLabel[]; truncated: boolean }> {
  if (labelsCached && labelsCached.expiresAt > Date.now()) return Promise.resolve({ labels: labelsCached.labels, truncated: labelsCached.truncated });
  if (labelsInFlight) return labelsInFlight;
  const request = loadLabels().then((result) => {
    labelsCached = { ...result, expiresAt: Date.now() + PLANNING_LIMITS.labelCacheMs };
    return result;
  }).finally(() => { if (labelsInFlight === request) labelsInFlight = null; });
  labelsInFlight = request;
  return request;
}

export async function createPlanningIssue(value: unknown): Promise<PlanningItem> {
  const input = validateCreatePlanningIssue(value);
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new PlanningFetchError("Authentication unavailable", 503);
  let response: Response;
  try {
    response = await fetch(createUrl(), {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "custom-dca-opencode",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(input),
      redirect: "error",
      signal: AbortSignal.timeout(PLANNING_LIMITS.timeoutMs),
    });
  } catch {
    throw new PlanningFetchError("Unavailable", 502);
  }
  if (response.status !== 201) throw classifiedError(response);
  let raw: unknown;
  try { raw = await response.json(); } catch { throw new PlanningFetchError("Unavailable", 502); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new PlanningFetchError("Unavailable", 502);
  const issue = normalizePlanningItem(raw as Record<string, unknown>);
  if (!issue || issue.type !== "issue") throw new PlanningFetchError("Unavailable", 502);
  issue.url = `${PLANNING_REPOSITORY.url}/issues/${issue.number}`;
  cacheGeneration += 1;
  cached = null;
  inFlight = null;
  return issue;
}
