// server/github-planning.ts — read-only planning feed for ONE fixed repository.
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
} as const;

export type PlanningItemType = "issue" | "pull_request";
export type PlanningItemState = "open" | "closed";
export type PlanningError = "Authentication unavailable" | "Rate limited" | "Unavailable";

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
  constructor(readonly safeMessage: PlanningError) {
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

/**
 * GitHub signals an exhausted rate limit with 403 plus a zero remaining header
 * far more often than with 429, so both have to map to "Rate limited" or the UI
 * tells the user to fix their credentials when they only need to wait.
 */
function classify(response: Response): PlanningError {
  if (response.status === 429) return "Rate limited";
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") return "Rate limited";
  if (response.status === 401 || response.status === 403) return "Authentication unavailable";
  return "Unavailable";
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
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(PLANNING_LIMITS.timeoutMs),
    });
  } catch {
    throw new PlanningFetchError("Unavailable");
  }
  if (!response.ok) throw new PlanningFetchError(classify(response));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PlanningFetchError("Unavailable");
  }
  if (!Array.isArray(body)) throw new PlanningFetchError("Unavailable");
  const link = response.headers.get("link") ?? "";
  return {
    items: body as Array<Record<string, unknown>>,
    hasNext: /(?:^|,)\s*<[^>]+>;\s*rel="next"(?:\s*[,;]|$)/u.test(link),
  };
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

/** Tests only. Module-level cache would otherwise leak between cases. */
export function resetPlanningCache(): void {
  cached = null;
  inFlight = null;
}

/**
 * Cached for PLANNING_LIMITS.cacheMs and coalesced while in flight: the page
 * polls, and several browser tabs must not multiply into several GitHub calls
 * against a shared rate limit.
 */
export function getPlanningSnapshot(refresh = false): Promise<PlanningSnapshot> {
  if (!refresh && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.snapshot);
  if (inFlight) return inFlight;
  const request = loadSnapshot()
    .then((snapshot) => {
      cached = { snapshot, expiresAt: Date.now() + PLANNING_LIMITS.cacheMs };
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = request;
  return request;
}
