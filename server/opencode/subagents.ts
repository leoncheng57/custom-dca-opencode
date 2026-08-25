// server/opencode/subagents.ts
//
// The derived sub-agent ledger.
//
// OpenCode can delegate work to child sessions, but it exposes no durable
// background-job API, so "what are this session's sub-agents doing?" has to be
// *derived*. Four upstream facts, each individually misleading, are combined
// here:
//
//   1. `GET /session/{id}/children` — the authoritative child list. Complete
//      and cheap, but says nothing about liveness.
//   2. The parent's task tool parts — carry the delegation's intent
//      (description, agent) and `state.metadata.sessionId`, the ONLY stable key
//      for a child. A task part flips to `completed` when the launch call
//      returns, which for a background task is long before the child finishes.
//      Reading that as "the child completed" is the single easiest way to lie
//      about this feature, so it is trusted only for synchronous delegations.
//   3. `GET /session/status` — busy/retry sessions owned by the process we are
//      connected to. Absence means "not owned here", never "idle".
//   4. The child's own transcript — the only trustworthy terminal evidence.
//
// When none of them settle the question — a cancelled child, or a server that
// restarted and dropped its in-memory registry — the answer is `unknown`.
// That is a deliberate product decision: three cancelled children were
// observed in the audit with no parent notification at all, and a UI that
// renders those as "completed" is worse than one that admits it cannot tell.

import { request, type OpencodeConfig } from "./client.js";
import { getCapabilities, type Capabilities } from "./capabilities.js";
import { listMessages, runningSessions, toSummary, type SessionSummary } from "./sessions.js";
import type { ModelSelection } from "./config.js";

/** Newest parent messages scanned for delegation intent. */
export const SUBAGENT_ENRICHMENT_MESSAGE_LIMIT = 100;
/** Children whose own transcript we are willing to probe in one request. */
export const SUBAGENT_TRANSCRIPT_PROBE_LIMIT = 12;
/** Upstream calls in flight while probing child transcripts. */
export const SUBAGENT_PROBE_CONCURRENCY = 4;

export type SubagentState = "launched" | "running" | "completed" | "failed" | "unknown";

/**
 * Why a state was chosen. Rendered verbatim-ish in the UI so a human can tell
 * a *derived* "completed" from an *observed* one.
 */
export type SubagentEvidence =
  | "session-status"
  | "child-transcript"
  | "parent-completion"
  | "parent-task-part"
  | "launch-only"
  | "no-terminal-evidence";

export interface SubagentTask {
  /** Child session id. The stable key — task part ids are not unique per child. */
  sessionID: string;
  parentID: string;
  title: string;
  /** Sub-agent type requested at launch, when the task part recorded one. */
  agent?: string;
  /** How this child was launched, when upstream metadata makes it knowable. */
  origin?: "native-task" | "managed-human";
  /** Human-requested policy provenance; not proof of effective capability. */
  requestedMode?: "plan" | "build";
  requestedModel?: ModelSelection;
  policySource?: "creation-permission";
  effectivePolicyObserved?: boolean;
  /** One-line delegation intent from the task tool input. */
  description?: string;
  state: SubagentState;
  evidence: SubagentEvidence;
  /** True when the delegation was promoted to (or launched as) background work. */
  background: boolean;
  /** True when the child session still exists upstream. */
  present: boolean;
  createdAt: string;
  updatedAt: string;
  cost: number;
  /** Failure text, when the evidence carried one. */
  detail?: string;
}

export interface SubagentReport {
  parentID: string;
  tasks: SubagentTask[];
  capabilities: Capabilities;
  /**
   * True when more children exist than we were willing to probe, so some
   * `unknown` rows may only be unknown because we did not look.
   */
  truncated: boolean;
}

// ── Narrow structural types ─────────────────────────────────────────────────

interface RawToolState {
  status?: string;
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  time?: { start?: number; end?: number };
}

interface RawPart {
  id?: string;
  type?: string;
  tool?: string;
  text?: string;
  state?: RawToolState;
}

interface RawMessageInfo {
  id?: string;
  role?: string;
  time?: { created?: number; completed?: number };
  error?: unknown;
}

export interface RawTranscriptMessage {
  info?: RawMessageInfo;
  parts?: RawPart[];
}

// ── Task-part parsing ───────────────────────────────────────────────────────

export interface TaskLaunch {
  sessionID: string;
  description?: string;
  agent?: string;
  background: boolean;
  status: "pending" | "running" | "completed" | "error";
  error?: string;
  launchedAt: number;
  updatedAt: number;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function oneLine(value: string | undefined, max = 160): string | undefined {
  if (!value) return undefined;
  const flat = value.replace(/\s+/gu, " ").trim();
  if (!flat) return undefined;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * The child session a tool part delegated to, if any.
 *
 * Keyed on metadata rather than on `tool === "task"` deliberately: the launch
 * tool has been renamed upstream before, but a delegation is definitionally a
 * part that produced a child session id, and that field has been stable.
 */
export function childSessionIdOf(part: RawPart): string | undefined {
  const metadata = part.state?.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;
  const source = metadata as Record<string, unknown>;
  return text(source.sessionId) ?? text(source.sessionID);
}

function launchStatus(raw: string | undefined): TaskLaunch["status"] {
  switch (raw) {
    case "pending":
    case "running":
    case "completed":
    case "error":
      return raw;
    default:
      return "running";
  }
}

/**
 * Delegations found in a parent transcript, one row per child session.
 *
 * Resume produces several task parts for the same child, so parts are
 * coalesced: earliest launch wins for the timestamp, latest part wins for
 * status, and any part reporting background promotion makes the row background.
 */
export function collectTaskLaunches(messages: RawTranscriptMessage[]): TaskLaunch[] {
  const byChild = new Map<string, TaskLaunch>();

  for (const message of messages) {
    const created = message.info?.time?.created ?? 0;
    for (const part of message.parts ?? []) {
      if (part.type !== "tool") continue;
      const sessionID = childSessionIdOf(part);
      if (!sessionID) continue;

      const state = part.state ?? {};
      const metadata = (state.metadata ?? {}) as Record<string, unknown>;
      const input = (state.input ?? {}) as Record<string, unknown>;
      const at = state.time?.start ?? created;
      const updated = state.time?.end ?? at;

      const existing = byChild.get(sessionID);
      const launch: TaskLaunch = {
        sessionID,
        description:
          oneLine(text(input.description)) ??
          oneLine(text(input.prompt)) ??
          oneLine(text(state.title)) ??
          existing?.description,
        agent: text(input.subagent_type) ?? text(metadata.agent) ?? existing?.agent,
        background: existing?.background === true || metadata.background === true,
        status: launchStatus(state.status),
        error: text(state.error) ?? existing?.error,
        launchedAt: existing ? Math.min(existing.launchedAt, at) : at,
        updatedAt: existing ? Math.max(existing.updatedAt, updated) : updated,
      };
      byChild.set(sessionID, launch);
    }
  }

  return [...byChild.values()];
}

// ── Synthetic completion notices ────────────────────────────────────────────

export interface SyntheticOutcome {
  outcome: "completed" | "failed";
  detail?: string;
  at: number;
}

// Failure is tested first so "failed to complete" is not read as a success.
const OUTCOME_FAILED = /\b(fail(?:s|ed|ure)?|error(?:ed|s)?|abort(?:ed)?|cancell?(?:ed)?|crash(?:ed)?)\b/iu;
const OUTCOME_DONE = /\b(complet(?:e|ed|ion)|finish(?:ed)?|done|succe(?:ss|eded|eds))\b/iu;

/**
 * Background children report back by injecting a user-role message into the
 * parent. There is no flag distinguishing that from something a human typed,
 * so the marker used here is the child session id: a synthetic notice names
 * the child it is about, and a human prompt essentially never does.
 *
 * An outcome keyword is required as well. A message that merely mentions a
 * child id settles nothing and is ignored rather than being read as terminal —
 * claiming a spurious "completed" is the expensive direction to be wrong in.
 */
export function collectSyntheticOutcomes(
  messages: RawTranscriptMessage[],
  knownChildIDs: Iterable<string>,
): Map<string, SyntheticOutcome> {
  const known = [...new Set(knownChildIDs)].filter((id) => id.length > 0);
  const outcomes = new Map<string, SyntheticOutcome>();
  if (known.length === 0) return outcomes;

  for (const message of messages) {
    if (message.info?.role !== "user") continue;
    const body = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n");
    if (!body) continue;

    const failed = OUTCOME_FAILED.test(body);
    if (!failed && !OUTCOME_DONE.test(body)) continue;

    for (const sessionID of known) {
      if (!body.includes(sessionID)) continue;
      outcomes.set(sessionID, {
        outcome: failed ? "failed" : "completed",
        detail: oneLine(body, 240),
        at: message.info?.time?.created ?? 0,
      });
    }
  }
  return outcomes;
}

// ── Child transcript evidence ───────────────────────────────────────────────

export interface TerminalEvidence {
  state: "completed" | "failed";
  detail?: string;
}

function errorText(error: unknown): string | undefined {
  if (typeof error === "string") return oneLine(error, 240);
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return oneLine(message, 240);
    return "The sub-agent turn failed.";
  }
  return undefined;
}

/**
 * Terminal state read from the child's own transcript, or null when its last
 * turn neither completed nor failed — which is what an interrupted or still
 * externally-owned run looks like.
 */
export function childTerminalState(messages: RawTranscriptMessage[]): TerminalEvidence | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index]?.info;
    if (!info || info.role !== "assistant") continue;
    if (info.error !== undefined && info.error !== null) {
      return { state: "failed", detail: errorText(info.error) };
    }
    if (typeof info.time?.completed === "number") return { state: "completed" };
    return null;
  }
  return null;
}

// ── Derivation ──────────────────────────────────────────────────────────────

export interface DeriveSubagentsInput {
  parentID: string;
  launches: TaskLaunch[];
  children: SessionSummary[];
  runningChildIDs: Set<string>;
  syntheticOutcomes: Map<string, SyntheticOutcome>;
  childTerminals: Map<string, TerminalEvidence | null>;
}

function resolveState(
  sessionID: string,
  launch: TaskLaunch | undefined,
  input: DeriveSubagentsInput,
): { state: SubagentState; evidence: SubagentEvidence; detail?: string } {
  // 1. Liveness we can actually observe beats every inference below it.
  if (input.runningChildIDs.has(sessionID)) {
    return { state: "running", evidence: "session-status" };
  }

  // 2. The child's own last turn is the only first-hand terminal evidence.
  const terminal = input.childTerminals.get(sessionID);
  if (terminal) {
    return { state: terminal.state, evidence: "child-transcript", detail: terminal.detail };
  }

  // 3. A synthetic notice in the parent is second-hand but explicit.
  const synthetic = input.syntheticOutcomes.get(sessionID);
  if (synthetic) {
    return { state: synthetic.outcome, evidence: "parent-completion", detail: synthetic.detail };
  }

  if (launch) {
    // 4. A launch that itself errored never produced working child work.
    if (launch.status === "error") {
      return { state: "failed", evidence: "parent-task-part", detail: launch.error };
    }
    // 5. A SYNCHRONOUS task part blocked until the child finished, so its
    //    completion is real. A background one only means the launch returned.
    if (!launch.background && launch.status === "completed") {
      return { state: "completed", evidence: "parent-task-part" };
    }
    if (launch.status === "pending" || launch.status === "running") {
      return { state: "launched", evidence: "launch-only" };
    }
  }

  // 6. Cancelled, or the owning process restarted and forgot. Say so.
  return { state: "unknown", evidence: "no-terminal-evidence" };
}

export function deriveSubagentTasks(input: DeriveSubagentsInput): SubagentTask[] {
  const launchByChild = new Map(input.launches.map((launch) => [launch.sessionID, launch]));
  const childByID = new Map(input.children.map((child) => [child.id, child]));
  const sessionIDs = new Set<string>([...launchByChild.keys(), ...childByID.keys()]);

  const tasks: SubagentTask[] = [];
  for (const sessionID of sessionIDs) {
    const launch = launchByChild.get(sessionID);
    const child = childByID.get(sessionID);
    const resolved = resolveState(sessionID, launch, input);
    const createdAt = child?.createdAt ?? new Date(launch?.launchedAt ?? 0).toISOString();
    const updatedAt = child?.updatedAt ?? new Date(launch?.updatedAt ?? launch?.launchedAt ?? 0).toISOString();

    tasks.push({
      sessionID,
      parentID: input.parentID,
      title: child?.title ?? launch?.description ?? "Sub-agent session",
      ...(launch?.agent ?? child?.agent ? { agent: launch?.agent ?? child?.agent } : {}),
      ...(launch?.description ? { description: launch.description } : {}),
      state: resolved.state,
      evidence: resolved.evidence,
      ...(child?.managed
        ? {
            origin: "managed-human" as const,
            requestedMode: child.managed.requestedMode,
            ...(child.managed.requestedModel ? { requestedModel: child.managed.requestedModel } : {}),
            policySource: child.managed.policySource,
            effectivePolicyObserved: child.managed.effectivePolicyObserved,
          }
        : launch ? { origin: "native-task" as const } : {}),
      background: child?.managed?.background === true || launch?.background === true,
      present: child !== undefined,
      createdAt,
      updatedAt,
      cost: child?.cost ?? 0,
      ...(resolved.detail ? { detail: resolved.detail } : {}),
    });
  }

  // Newest first: an orchestration session accumulates dozens of children and
  // the ones a human is waiting on are always the recent ones.
  return tasks.sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
      || left.sessionID.localeCompare(right.sessionID),
  );
}

// ── Upstream orchestration ──────────────────────────────────────────────────

export async function listChildren(
  config: OpencodeConfig,
  directory: string,
  parentID: string,
  running: Set<string>,
): Promise<SessionSummary[]> {
  const raw = await request<Array<Parameters<typeof toSummary>[0]>>(
    config,
    `/session/${encodeURIComponent(parentID)}/children`,
    { directory },
  );
  return (raw ?? [])
    .filter((child) => child && typeof child === "object")
    .map((child) => toSummary(child, running.has(child.id ?? "")));
}

async function probeChildTerminals(
  config: OpencodeConfig,
  directory: string,
  sessionIDs: string[],
): Promise<Map<string, TerminalEvidence | null>> {
  const results = new Map<string, TerminalEvidence | null>();
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < sessionIDs.length) {
      const sessionID = sessionIDs[cursor];
      cursor += 1;
      // A failed probe must not blank the panel; it degrades that one row to
      // `unknown`, which is exactly what "we could not tell" should look like.
      const page = await listMessages(config, directory, sessionID, { limit: 5 }).catch(() => null);
      results.set(sessionID, page ? childTerminalState(page.messages as RawTranscriptMessage[]) : null);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SUBAGENT_PROBE_CONCURRENCY, sessionIDs.length) }, worker),
  );
  return results;
}

/**
 * The full ledger for one parent session.
 *
 * Cost is bounded on purpose. The child list and status map are one call each,
 * parent enrichment reads only the newest page, and child transcripts are
 * probed only for children that are neither running nor already settled by
 * parent-side evidence — newest first, capped, and concurrency-limited. A
 * session with 120 children therefore costs a predictable handful of requests
 * rather than 120.
 */
export async function listSubagents(
  config: OpencodeConfig,
  directory: string,
  parentID: string,
): Promise<SubagentReport> {
  const running = await runningSessions(config, directory).catch(() => new Set<string>());

  const [children, parentPage, capabilities] = await Promise.all([
    listChildren(config, directory, parentID, running),
    listMessages(config, directory, parentID, { limit: SUBAGENT_ENRICHMENT_MESSAGE_LIMIT })
      .catch(() => ({ messages: [] as unknown[], nextCursor: null })),
    getCapabilities(config, directory),
  ]);

  const parentMessages = parentPage.messages as RawTranscriptMessage[];
  const launches = collectTaskLaunches(parentMessages);
  const childIDs = new Set<string>([
    ...children.map((child) => child.id),
    ...launches.map((launch) => launch.sessionID),
  ]);
  const syntheticOutcomes = collectSyntheticOutcomes(parentMessages, childIDs);

  // Only children whose state is still genuinely open are worth a round trip.
  const unresolved = [...childIDs]
    .filter((id) => !running.has(id) && !syntheticOutcomes.has(id))
    .sort((left, right) => {
      const leftAt = Date.parse(children.find((child) => child.id === left)?.updatedAt ?? "") || 0;
      const rightAt = Date.parse(children.find((child) => child.id === right)?.updatedAt ?? "") || 0;
      return rightAt - leftAt;
    });
  const probed = unresolved.slice(0, SUBAGENT_TRANSCRIPT_PROBE_LIMIT);
  const childTerminals = await probeChildTerminals(config, directory, probed);

  return {
    parentID,
    tasks: deriveSubagentTasks({
      parentID,
      launches,
      children,
      runningChildIDs: running,
      syntheticOutcomes,
      childTerminals,
    }),
    capabilities,
    truncated: unresolved.length > probed.length,
  };
}

/**
 * Promote a running synchronous child to background execution.
 *
 * Upstream answers a bare boolean and only accepts children that are running
 * right now, so a `false` here means "the child was not eligible", not "the
 * server is broken" — the caller turns that into a 409.
 */
export async function promoteSubagentToBackground(
  config: OpencodeConfig,
  directory: string,
  parentID: string,
): Promise<boolean> {
  const result = await request<unknown>(
    config,
    `/experimental/session/${encodeURIComponent(parentID)}/background`,
    { method: "POST", directory },
  );
  return result === true;
}
