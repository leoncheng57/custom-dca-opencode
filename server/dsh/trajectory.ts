import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BridgeNotification } from "./bridge.js";

export type TrajectoryCategory = "turn" | "request" | "message" | "tool" | "compaction" | "child" | "status" | "error";

export interface DshTrajectoryUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export interface DshTrajectoryMetadata {
  turn?: number;
  step?: number;
  phase?: "start" | "end" | "chunk" | "committed";
  reason?: string;
  provider?: string;
  model?: string;
  contextWindow?: number;
  callId?: string;
  resultIsError?: boolean;
  compactionId?: string;
  shadowedEventCount?: number;
  shadowedTokenCount?: number;
  childSessionId?: string;
  parentSessionId?: string;
  localChild?: boolean;
  standalone?: boolean;
  usage?: DshTrajectoryUsage;
}

export interface DshTrajectoryEvent {
  id: string;
  observationSeq: number;
  sessionId: string;
  observedAt: string;
  type: string;
  nativeSessionId?: string;
  nativeSeq?: number;
  nativeTime?: string;
  ignorable?: true;
  sourceEventSeqs?: number[];
  sourceEventSeqsTruncated?: true;
  surfaceOp?: "append" | { op: "replace"; start: number; end: number };
  category: TrajectoryCategory;
  title: string;
  summary?: string;
  metadata?: DshTrajectoryMetadata;
  source: "dsh-native-notification" | "dca-lifecycle";
  hasDetail: boolean;
  sensitive: boolean;
}

interface StoredTrajectoryEvent extends DshTrajectoryEvent {
  detail?: unknown;
  detailTruncated?: true;
}

export interface DshTrajectoryDetail {
  eventId: string;
  detail: unknown;
  truncated: boolean;
  warning: string;
}

export interface DshTrajectoryCoverage {
  source: "dca-captured-projection";
  complete: false;
  mayContainGaps: true;
  capturedFrom: string | null;
  capturedThrough: string | null;
  nativeStreams: Array<{ session: string; first: number; last: number; gaps: number }>;
  note: string;
}

export interface DshTrajectoryPage {
  events: DshTrajectoryEvent[];
  nextBefore: number | null;
  coverage: DshTrajectoryCoverage;
}

const EVENT_LIMIT = 5_000;
const PAGE_LIMIT = 500;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SESSION_FILES = 200;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_DETAIL_BYTES = 16 * 1024;
const MAX_STRING_BYTES = 2_000;
const MAX_DEPTH = 6;
const MAX_NODES = 2_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
// One credential vocabulary for both structured keys and free-form text. They
// were separate lists, and the free-form one used `\b`, which cannot match
// inside `access_token` because `_` is a word character — so a structured
// `access_token` key was redacted while `access_token=...` inside a tool
// argument or error string survived verbatim.
const SECRET_LABEL = "authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|session[-_]?(?:id|key|token)|password|passphrase|secret|cookie|credential|private[-_]?key|token";
const SECRET_KEY = new RegExp(`(?:${SECRET_LABEL})`, "iu");
const SECRET_VALUE = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[opsu]_[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|AKIA[A-Z0-9]{16})\b/gu;
const SECRET_VALUE_TEST = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[opsu]_[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|AKIA[A-Z0-9]{16})\b/iu;
// The value runs to the end of the line rather than the first space: a header
// like `Authorization: Basic <token>` would otherwise lose only `Basic` and
// keep the credential. Commas, semicolons and `}` still terminate it so one
// cookie pair or JSON member does not swallow its neighbours.
const SECRET_ASSIGNMENT = new RegExp(`["']?(${SECRET_LABEL})["']?\\s*[:=]\\s*(?:"[^"]*"|'[^']*'|[^\\n,;\\}]+)`, "giu");
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u;
const KNOWN_NATIVE_TYPES = new Set([
  "agent-preset/selected", "agent/inbox/spliced", "approval/asked", "approval/decided", "approval/policy",
  "assistant/chunk", "assistant/message", "command/done", "command/run", "compaction/end", "compaction/prune",
  "compaction/start", "compaction/summary", "feedback/record", "goal/change", "hook/invoked", "hook/result",
  "llm/retry", "llm/retry-started", "permission/preset", "plan/mode", "request/context", "request/header",
  "sandbox/mode", "schedule/change", "session/end-seed", "session/title", "session/title-llm-request", "step/end",
  "step/start", "subagent/descriptor", "team/member", "team/message/delivered", "team/message/queued", "team/task",
  "todo/write", "tool-workflow/agent-end", "tool-workflow/agent-start", "tool-workflow/run-end", "tool-workflow/run-start",
  "tool/call", "tool/code-dispatch", "tool/code-dispatch-start", "tool/result", "turn/end", "turn/start", "user/message",
  "web/deepseek-search-llm-request",
]);
const SAFE_REASONS = new Set(["initial", "resume", "change", "completed", "aborted", "blocked", "error", "max-tokens", "interrupted", "refusal", "stop", "tool-calls", "text-delta", "reasoning-delta", "usage", "finish", "one-shot", "continuable", "running", "idle", "failed"]);
const SAFE_SOURCE_KINDS = new Set(["user", "plugin", "goal"]);

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) end--;
  return value.slice(0, end);
}

function redactString(value: string): string {
  return truncateUtf8(value.replace(SECRET_VALUE, "[REDACTED]").replace(SECRET_ASSIGNMENT, "$1=[REDACTED]"), MAX_STRING_BYTES);
}

function safeName(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_NAME.test(value) && !SECRET_VALUE_TEST.test(value) ? value : undefined;
}

function safeReason(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_REASONS.has(value) ? value : undefined;
}

function opaqueIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return `id:${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function safeEventType(value: unknown): string {
  return typeof value === "string" && KNOWN_NATIVE_TYPES.has(value) ? value : "unknown";
}

function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function sanitizeDetail(value: unknown): { value: unknown; truncated: boolean } {
  let nodes = 0;
  let truncated = false;
  const visit = (item: unknown, depth: number): unknown => {
    nodes++;
    if (nodes > MAX_NODES) { truncated = true; return "[NODE_LIMIT]"; }
    if (depth > MAX_DEPTH) { truncated = true; return "[DEPTH_LIMIT]"; }
    if (typeof item === "string") {
      if (Buffer.byteLength(item, "utf8") <= MAX_STRING_BYTES && /^[\[{]/u.test(item.trim())) {
        try { return visit(JSON.parse(item), depth + 1); } catch { /* preserve non-JSON text below */ }
      }
      const bounded = redactString(item);
      if (bounded !== item) truncated = true;
      return bounded;
    }
    if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
    if (Array.isArray(item)) {
      if (item.length > MAX_ARRAY_ITEMS) truncated = true;
      return item.slice(0, MAX_ARRAY_ITEMS).map((entry) => visit(entry, depth + 1));
    }
    if (!item || typeof item !== "object") return String(item ?? "");
    const entries = Object.entries(item);
    if (entries.length > MAX_OBJECT_KEYS) truncated = true;
    const output: Record<string, unknown> = {};
    for (const [index, [key, entry]] of entries.slice(0, MAX_OBJECT_KEYS).entries()) {
      const outputKey = SECRET_KEY.test(key) ? `[REDACTED_KEY_${index}]` : truncateUtf8(key.replace(SECRET_VALUE, "[REDACTED]"), 160);
      output[outputKey] = SECRET_KEY.test(key) ? "[REDACTED]" : visit(entry, depth + 1);
    }
    return output;
  };
  const sanitized = visit(value, 0);
  const serialized = JSON.stringify(sanitized) ?? "";
  if (Buffer.byteLength(serialized, "utf8") <= MAX_DETAIL_BYTES) return { value: sanitized, truncated };
  // The preview is itself re-serialized into the JSONL record, so escaping and
  // the wrapper keys can push the persisted bytes back over the limit. Bound
  // the FINAL representation, not the pre-escape string.
  return { value: boundedPreview(serialized), truncated: true };
}

function boundedPreview(serialized: string): { preview: string; omitted: string } {
  const omitted = "detail exceeded capture limit";
  let preview = truncateUtf8(serialized, MAX_DETAIL_BYTES);
  for (;;) {
    const wrapped = { preview, omitted };
    const overflow = Buffer.byteLength(JSON.stringify(wrapped), "utf8") - MAX_DETAIL_BYTES;
    if (overflow <= 0 || preview.length === 0) return wrapped;
    preview = preview.slice(0, Math.max(0, preview.length - Math.max(1, Math.ceil(overflow / 2))));
  }
}

function dataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function usage(value: unknown): DshTrajectoryUsage | undefined {
  const item = dataObject(value);
  const inputTokens = safeInteger(item.inputTokens);
  const outputTokens = safeInteger(item.outputTokens);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  const optional = (key: string) => safeInteger(item[key]);
  return {
    inputTokens,
    outputTokens,
    ...(optional("cacheReadTokens") === undefined ? {} : { cacheReadTokens: optional("cacheReadTokens") }),
    ...(optional("cacheWriteTokens") === undefined ? {} : { cacheWriteTokens: optional("cacheWriteTokens") }),
    ...(optional("reasoningTokens") === undefined ? {} : { reasoningTokens: optional("reasoningTokens") }),
  };
}

interface SafeProjection {
  category: TrajectoryCategory;
  title: string;
  summary?: string;
  metadata?: DshTrajectoryMetadata;
  sensitive: boolean;
}

interface ProjectionPolicy {
  allowedProviders: ReadonlySet<string>;
  allowedModels: ReadonlySet<string>;
}

function nativeProjection(type: string, value: unknown, policy: ProjectionPolicy, nativeSessionId: string, ignorable: boolean): SafeProjection {
  const displayType = safeEventType(type);
  const data = dataObject(value);
  const turn = safeInteger(data.turn);
  const step = safeInteger(data.step);
  const location = { ...(turn === undefined ? {} : { turn }), ...(step === undefined ? {} : { step }) };
  if (type === "turn/start") return { category: "turn", title: `Turn ${turn ?? "?"} started`, metadata: { ...location, phase: "start" }, sensitive: false };
  if (type === "turn/end") {
    const reason = safeReason(dataObject(data.reason).kind) ?? "unknown";
    return { category: reason === "error" || reason === "blocked" ? "error" : "turn", title: `Turn ${turn ?? "?"} ${reason}`, metadata: { ...location, phase: "end", reason }, sensitive: false };
  }
  if (type === "step/start" || type === "step/end") {
    const phase = type.endsWith("start") ? "start" : "end";
    return { category: "turn", title: `Step ${step ?? "?"} ${phase === "start" ? "started" : "ended"}`, metadata: { ...location, phase }, sensitive: false };
  }
  if (type === "request/header") {
    const header = dataObject(data.header);
    const config = dataObject(header.config);
    const provider = typeof config.provider === "string" && policy.allowedProviders.has(config.provider) ? config.provider : undefined;
    const model = typeof config.model === "string" && policy.allowedModels.has(config.model) ? config.model : undefined;
    const reason = safeReason(data.reason);
    return { category: "request", title: "Request header captured", summary: [provider, model].filter(Boolean).join(" / ") || undefined, metadata: { reason, provider, model }, sensitive: true };
  }
  if (type === "request/context") {
    const provider = typeof data.provider === "string" && policy.allowedProviders.has(data.provider) ? data.provider : undefined;
    const model = typeof data.model === "string" && policy.allowedModels.has(data.model) ? data.model : undefined;
    const contextWindow = safeInteger(data.contextWindow);
    return { category: "request", title: "Request route context", summary: [provider, model].filter(Boolean).join(" / ") || undefined, metadata: { provider, model, contextWindow }, sensitive: false };
  }
  if (type === "user/message") {
    const rawSourceKind = dataObject(data.source).kind;
    const sourceKind = typeof rawSourceKind === "string" && SAFE_SOURCE_KINDS.has(rawSourceKind) ? rawSourceKind : undefined;
    const sourcePlugin = safeName(dataObject(data.source).plugin);
    if (sourceKind === "plugin" && sourcePlugin === "compact") {
      return { category: "compaction", title: "Compaction surface replacement", metadata: { phase: "committed", compactionId: opaqueIdentifier(dataObject(data.source).compactionId) }, sensitive: true };
    }
    return { category: "message", title: sourceKind === "user" ? "User message committed" : "Context message committed", summary: sourceKind ? `Source: ${sourceKind}` : undefined, metadata: { phase: "committed" }, sensitive: true };
  }
  if (type === "assistant/chunk") {
    const chunk = dataObject(data.chunk);
    const chunkType = safeReason(chunk.type);
    const reportedUsage = chunkType === "usage" ? usage(chunk.usage) : undefined;
    return { category: "message", title: "Assistant stream chunk", summary: chunkType ? `Chunk: ${chunkType}` : undefined, metadata: { ...location, phase: "chunk", reason: chunkType, ...(reportedUsage ? { usage: reportedUsage } : {}) }, sensitive: true };
  }
  if (type === "assistant/message") {
    const reportedUsage = usage(data.usage);
    return { category: "message", title: "Assistant message committed", summary: data.interrupted === true ? "Interrupted output" : undefined, metadata: { ...location, phase: "committed", ...(reportedUsage ? { usage: reportedUsage } : {}) }, sensitive: true };
  }
  if (type === "tool/call") {
    const callId = opaqueIdentifier(data.callId);
    return { category: "tool", title: "Tool called", metadata: { ...location, callId, phase: "start" }, sensitive: true };
  }
  if (type === "tool/result") {
    const message = dataObject(data.message);
    const source = dataObject(message.source);
    const callId = opaqueIdentifier(source.callId);
    const resultContent = Array.isArray(message.content) ? message.content[0] : undefined;
    const resultIsError = dataObject(resultContent).isError === true || data.error !== undefined;
    return { category: resultIsError ? "error" : "tool", title: resultIsError ? "Tool result failed" : "Tool result committed", metadata: { ...location, callId, resultIsError, phase: "end" }, sensitive: true };
  }
  if (type === "compaction/start" || type === "compaction/end") {
    const phase = type.endsWith("start") ? "start" : "end";
    const compactionId = opaqueIdentifier(data.compactionId);
    const failed = phase === "end" && data.error !== undefined;
    const standalone = data.turn === null;
    return { category: failed ? "error" : "compaction", title: failed ? "Compaction failed" : `${standalone ? "Standalone compaction" : "Compaction"} ${phase === "start" ? "started" : "ended"}`, metadata: { turn, phase, compactionId, ...(standalone ? { standalone: true } : {}) }, sensitive: failed };
  }
  if (type === "compaction/summary") {
    const shadowedSeqs = Array.isArray(data.shadowedSeqs) ? data.shadowedSeqs : [];
    const compactionId = opaqueIdentifier(data.compactionId);
    const reportedUsage = usage(data.usage);
    return { category: "compaction", title: "Compaction summary committed", summary: `${shadowedSeqs.length} surface events replaced`, metadata: { compactionId, shadowedEventCount: shadowedSeqs.length, shadowedTokenCount: safeInteger(data.shadowedTokenCount), ...(reportedUsage ? { usage: reportedUsage } : {}) }, sensitive: true };
  }
  if (type === "compaction/prune") {
    const shadowedSeqs = Array.isArray(data.shadowedSeqs) ? data.shadowedSeqs : [];
    return { category: "compaction", title: "Context pruned", summary: `${shadowedSeqs.length} surface events replaced`, metadata: { shadowedEventCount: shadowedSeqs.length, shadowedTokenCount: safeInteger(data.shadowedTokenCount) }, sensitive: true };
  }
  if (type === "subagent/descriptor") {
    return { category: "child", title: "Child descriptor committed", metadata: { childSessionId: nativeSessionId, reason: safeReason(data.mode) }, sensitive: true };
  }
  if (/^(?:subagent|team|tool-workflow\/agent)[/-]/u.test(type)) {
    return { category: "child", title: "Child-agent lifecycle", summary: displayType, metadata: { childSessionId: opaqueIdentifier(data.id), parentSessionId: opaqueIdentifier(data.parentId), reason: safeReason(data.stopReason) }, sensitive: true };
  }
  if (displayType === "unknown") return ignorable
    ? { category: "status", title: "Unknown ignorable DSH event", sensitive: true }
    : { category: "error", title: "Unsupported required DSH event", sensitive: true };
  if (/error|fail|refusal/iu.test(type)) return { category: "error", title: "Runtime failure", summary: displayType, sensitive: true };
  return { category: "status", title: "DSH runtime event", summary: displayType, sensitive: false };
}

function sdkNotificationProjection(method: unknown, value: unknown): { type: string; projection: SafeProjection } {
  const data = dataObject(value);
  if (method === "subagent.started") return {
    type: "subagent.started",
    projection: { category: "child", title: "Child agent started", metadata: { parentSessionId: opaqueIdentifier(data.parentSessionId), childSessionId: opaqueIdentifier(data.childSessionId) }, sensitive: true },
  };
  if (method === "subagent.finished") return {
    type: "subagent.finished",
    projection: { category: data.status === "error" ? "error" : "child", title: "Child agent finished", metadata: { parentSessionId: opaqueIdentifier(data.parentSessionId), childSessionId: opaqueIdentifier(data.childSessionId), reason: safeReason(data.stopReason) }, sensitive: true },
  };
  if (method === "session.status") return {
    type: "session.status",
    projection: { category: "status", title: "DSH session status", metadata: { reason: safeReason(data.status) }, sensitive: true },
  };
  return { type: "sdk.notification", projection: { category: "status", title: "DSH SDK notification", sensitive: true } };
}

function lifecycleProjection(type: string): SafeProjection {
  if (type === "dca/session-created") return { category: "status", title: "DCA capture started", sensitive: false };
  if (type === "dca/prompt-accepted") return { category: "turn", title: "Prompt accepted by bridge", sensitive: false };
  if (type === "dca/cancelled-by-user") return { category: "status", title: "Cancelled by user", sensitive: false };
  if (type === "dca/bridge-exit") return { category: "error", title: "Bridge exited during capture", sensitive: false };
  if (type === "dca/prompt-rejected") return { category: "error", title: "Bridge rejected the prompt", sensitive: true };
  if (type === "dca/cancel-failed") return { category: "error", title: "Bridge cancellation failed", sensitive: true };
  if (type === "dca/workspace-identity-changed") return { category: "error", title: "Allowlisted workspace identity changed", sensitive: false };
  if (type === "dca/workspace-unavailable") return { category: "error", title: "Allowlisted workspace is unavailable", sensitive: true };
  if (type === "finished") return { category: "status", title: "DSH run finished", sensitive: true };
  if (type === "failed") return { category: "error", title: "DSH run failed", sensitive: true };
  return { category: "status", title: "DCA lifecycle event", summary: type, sensitive: false };
}

function eventFile(root: string, sessionId: string): string {
  if (!/^dsh-[A-Za-z0-9-]+$/u.test(sessionId)) throw new Error("invalid DSH trajectory session id");
  return path.join(root, `${sessionId}.jsonl`);
}

function publicEvent({ detail: _detail, detailTruncated: _detailTruncated, ...event }: StoredTrajectoryEvent): DshTrajectoryEvent {
  return event;
}

function coverage(events: StoredTrajectoryEvent[]): DshTrajectoryCoverage {
  const streams = new Map<string, number[]>();
  for (const event of events) {
    if (event.nativeSeq === undefined || !event.nativeSessionId) continue;
    const sequences = streams.get(event.nativeSessionId) ?? [];
    sequences.push(event.nativeSeq);
    streams.set(event.nativeSessionId, sequences);
  }
  const nativeStreams = [...streams.entries()].map(([session, values]) => {
    const sequences = [...new Set(values)].sort((a, b) => a - b);
    let gaps = 0;
    for (let index = 1; index < sequences.length; index++) gaps += Math.max(0, sequences[index] - sequences[index - 1] - 1);
    return { session, first: sequences[0], last: sequences.at(-1)!, gaps };
  }).sort((a, b) => a.session.localeCompare(b.session));
  return {
    source: "dca-captured-projection",
    complete: false,
    mayContainGaps: true,
    capturedFrom: events[0]?.observedAt ?? null,
    capturedThrough: events.at(-1)?.observedAt ?? null,
    nativeStreams,
    note: "DCA-captured projection only. It is not canonical DSH persistence, starts when the bridge observes events, and may contain gaps.",
  };
}

export class DshTrajectoryStore {
  private readonly cache = new Map<string, StoredTrajectoryEvent[]>();
  private readonly cacheBytes = new Map<string, number>();
  private readonly loads = new Map<string, Promise<StoredTrajectoryEvent[]>>();
  private readonly writes = new Map<string, Promise<void>>();
  private readonly activeFiles = new Map<string, number>();
  private retentionWrite = Promise.resolve();
  private lastPrune = 0;

  private readonly sensitiveEnabled: boolean;
  private readonly policy: ProjectionPolicy;

  constructor(private readonly root: string, options: { sensitiveEnabled?: boolean; maintenanceEnabled?: boolean; allowedProviders?: Iterable<string>; allowedModels?: Iterable<string> } = {}) {
    this.sensitiveEnabled = options.sensitiveEnabled === true;
    this.policy = { allowedProviders: new Set(options.allowedProviders), allowedModels: new Set(options.allowedModels) };
    if (options.maintenanceEnabled === true) {
      setTimeout(() => void this.initializeRetention(), 0).unref();
      setInterval(() => void this.initializeRetention(), 60_000).unref();
    }
  }

  async appendBridge(notification: BridgeNotification): Promise<void> {
    const payload = dataObject(notification.notification?.payload);
    const native = dataObject(payload.event);
    if (notification.type === "notification" && notification.notification?.method === "session.event") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId || typeof native.type !== "string" || safeInteger(native.seq) === undefined || safeInteger(native.time) === undefined || !("data" in native)) {
        await this.append(notification.sessionId, "dca/capture-gap", undefined, "dca-lifecycle", {}, { category: "error", title: "Malformed native event was not captured", sensitive: false });
        return;
      }
      const nativeDate = new Date(Number(native.time));
      if (!Number.isFinite(nativeDate.getTime())) {
        await this.append(notification.sessionId, "dca/capture-gap", undefined, "dca-lifecycle", {}, { category: "error", title: "Malformed native event was not captured", sensitive: false });
        return;
      }
      const sourceEventSeqs = Array.isArray(native.sourceEventSeqs)
        ? native.sourceEventSeqs.flatMap((item) => {
          const sequence = safeInteger(item);
          return sequence === undefined ? [] : [sequence];
        }).slice(0, 5_000)
        : undefined;
      const sourceEventSeqsTruncated = Array.isArray(native.sourceEventSeqs) && native.sourceEventSeqs.length > 5_000;
      const op = dataObject(native.surfaceOp);
      const surfaceOp = native.surfaceOp === "append" ? "append" as const
        : op.op === "replace" && safeInteger(op.start) !== undefined && safeInteger(op.end) !== undefined
          ? { op: "replace" as const, start: Number(op.start), end: Number(op.end) }
          : undefined;
      const capturedType = safeEventType(native.type);
      const nativeSessionId = opaqueIdentifier(payload.sessionId)!;
      await this.append(notification.sessionId, capturedType, native, "dsh-native-notification", {
        nativeSessionId,
        nativeSeq: Number(native.seq),
        nativeTime: nativeDate.toISOString(),
        ...(native.ignorable === true ? { ignorable: true as const } : {}),
        ...(sourceEventSeqs === undefined ? {} : { sourceEventSeqs }),
        ...(sourceEventSeqsTruncated ? { sourceEventSeqsTruncated: true as const } : {}),
        ...(surfaceOp ? { surfaceOp } : {}),
      }, nativeProjection(native.type, native.data, this.policy, nativeSessionId, native.ignorable === true));
      return;
    }
    if (notification.type === "notification") {
      const mapped = sdkNotificationProjection(notification.notification?.method, payload);
      await this.append(notification.sessionId, mapped.type, payload, "dsh-native-notification", {}, mapped.projection);
      return;
    }
    await this.append(notification.sessionId, notification.type, notification, "dca-lifecycle", {}, lifecycleProjection(notification.type));
  }

  async appendLifecycle(sessionId: string, type: string, detail?: unknown): Promise<void> {
    await this.append(sessionId, type, detail, "dca-lifecycle", {}, lifecycleProjection(type));
  }

  private async append(
    sessionId: string,
    type: string,
    rawDetail: unknown,
    source: DshTrajectoryEvent["source"],
    native: Pick<DshTrajectoryEvent, "nativeSessionId" | "nativeSeq" | "nativeTime" | "ignorable" | "sourceEventSeqs" | "sourceEventSeqsTruncated" | "surfaceOp">,
    projection: SafeProjection,
  ): Promise<void> {
    const file = eventFile(this.root, sessionId);
    this.activeFiles.set(file, (this.activeFiles.get(file) ?? 0) + 1);
    const previous = this.writes.get(sessionId) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        const events = await this.load(sessionId);
        if (native.nativeSeq !== undefined && events.some((event) => event.source === "dsh-native-notification" && event.nativeSessionId === native.nativeSessionId && event.nativeSeq === native.nativeSeq)) return;
        const sanitized = !this.sensitiveEnabled || rawDetail === undefined ? { value: undefined, truncated: false } : sanitizeDetail(rawDetail);
        const event: StoredTrajectoryEvent = {
          id: native.nativeSeq === undefined ? randomUUID() : `${native.nativeSessionId}:${native.nativeSeq}`,
          observationSeq: (events.at(-1)?.observationSeq ?? 0) + 1,
          sessionId,
          observedAt: new Date().toISOString(),
          type,
          ...native,
          ...projection,
          source,
          ...(sanitized.value === undefined ? {} : { detail: sanitized.value }),
          hasDetail: sanitized.value !== undefined,
          ...(sanitized.truncated ? { detailTruncated: true as const } : {}),
        };
        const eventLine = JSON.stringify(event);
        const nextEvents = [...events, event];
        let bytes = (this.cacheBytes.get(sessionId) ?? 0) + Buffer.byteLength(eventLine, "utf8") + 1;
        let pruned = false;
        const cutoff = Date.now() - MAX_AGE_MS;
        while (nextEvents.length > 1 && (nextEvents.length > EVENT_LIMIT || Date.parse(nextEvents[0].observedAt) < cutoff || bytes > MAX_FILE_BYTES)) {
          const removed = nextEvents.shift()!;
          bytes -= Buffer.byteLength(JSON.stringify(removed), "utf8") + 1;
          pruned = true;
        }
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await chmod(this.root, 0o700);
        if (pruned) {
          const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
          await writeFile(temporary, `${nextEvents.map((item) => JSON.stringify(item)).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
          await rename(temporary, file);
        } else {
          await appendFile(file, `${eventLine}\n`, { encoding: "utf8", mode: 0o600 });
        }
        await chmod(file, 0o600);
        this.cache.set(sessionId, nextEvents);
        this.cacheBytes.set(sessionId, bytes);
      } finally {
        const remaining = (this.activeFiles.get(file) ?? 1) - 1;
        if (remaining <= 0) this.activeFiles.delete(file);
        else this.activeFiles.set(file, remaining);
      }
      await this.pruneFiles();
    });
    this.writes.set(sessionId, next.catch(() => undefined));
    await next;
  }

  async page(sessionId: string, options: { limit?: number; before?: number } = {}): Promise<DshTrajectoryPage> {
    await this.pruneFiles(true);
    const events = await this.load(sessionId);
    const requested = options.limit ?? 200;
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(PAGE_LIMIT, Math.trunc(requested))) : 200;
    const eligible = options.before === undefined ? events : events.filter((event) => event.observationSeq < options.before!);
    const selected = eligible.slice(-limit);
    return {
      events: selected.map(publicEvent),
      nextBefore: eligible.length > selected.length ? selected[0]?.observationSeq ?? null : null,
      coverage: coverage(events),
    };
  }

  async export(sessionId: string): Promise<{ version: 1; coverage: DshTrajectoryCoverage; events: DshTrajectoryEvent[] }> {
    await this.pruneFiles(true);
    const events = await this.load(sessionId);
    return { version: 1, coverage: coverage(events), events: events.map(publicEvent) };
  }

  async detail(sessionId: string, eventId: string): Promise<DshTrajectoryDetail | null> {
    await this.pruneFiles(true);
    const event = (await this.load(sessionId)).find((candidate) => candidate.id === eventId);
    if (!event?.hasDetail) return null;
    return {
      eventId,
      detail: event.detail,
      truncated: event.detailTruncated === true,
      warning: "Sensitive DCA-captured detail may contain prompts, commands, paths, tool input/output, reasoning, context, or model text. Credential-shaped values are redacted before persistence.",
    };
  }

  async exportFull(sessionId: string): Promise<{ version: 1; coverage: DshTrajectoryCoverage; events: StoredTrajectoryEvent[] }> {
    await this.pruneFiles(true);
    const events = await this.load(sessionId);
    return { version: 1, coverage: coverage(events), events: [...events] };
  }

  async flush(sessionId: string): Promise<void> {
    await this.writes.get(sessionId);
  }

  private async load(sessionId: string): Promise<StoredTrajectoryEvent[]> {
    const cached = this.cache.get(sessionId);
    if (cached) return cached;
    const pending = this.loads.get(sessionId);
    if (pending) return pending;
    const loading = (async () => {
      let events: StoredTrajectoryEvent[] = [];
      try {
        const file = eventFile(this.root, sessionId);
        const metadata = await stat(file);
        if (metadata.size > MAX_FILE_BYTES) {
          await unlink(file);
          this.cacheBytes.delete(sessionId);
          return events;
        }
        const content = await readFile(file, "utf8");
        const parsed = content.split("\n").filter(Boolean).slice(-EVENT_LIMIT).flatMap((line) => {
          try {
            const parsed = JSON.parse(line) as StoredTrajectoryEvent;
            return parsed.sessionId === sessionId && Number.isSafeInteger(parsed.observationSeq) ? [parsed] : [];
          } catch {
            return [];
          }
        });
        const cutoff = Date.now() - MAX_AGE_MS;
        events = parsed.filter((event) => Number.isFinite(Date.parse(event.observedAt)) && Date.parse(event.observedAt) >= cutoff);
        if (events.length !== parsed.length) {
          const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
          await writeFile(temporary, events.length ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n` : "", { encoding: "utf8", mode: 0o600 });
          await rename(temporary, file);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      this.cache.set(sessionId, events);
      this.cacheBytes.set(sessionId, events.reduce((bytes, event) => bytes + Buffer.byteLength(JSON.stringify(event), "utf8") + 1, 0));
      return events;
    })();
    this.loads.set(sessionId, loading);
    try { return await loading; } finally { this.loads.delete(sessionId); }
  }

  private async pruneFiles(force = false): Promise<void> {
    if (!force && Date.now() - this.lastPrune < 5_000) return;
    const pruning = this.retentionWrite.then(() => this.pruneFilesNow());
    this.retentionWrite = pruning.catch(() => undefined);
    await pruning;
  }

  private async initializeRetention(): Promise<void> {
    try {
      await this.pruneFiles(true);
      const files = await readdir(this.root, { withFileTypes: true });
      for (const entry of files) {
        if (!entry.isFile() || !/^dsh-[A-Za-z0-9-]+\.jsonl$/u.test(entry.name)) continue;
        const sessionId = entry.name.slice(0, -6);
        const file = path.join(this.root, entry.name);
        if ((this.activeFiles.get(file) ?? 0) > 0) continue;
        const previous = this.writes.get(sessionId) ?? Promise.resolve();
        const maintenance = previous.then(async () => {
          if ((this.activeFiles.get(file) ?? 0) > 0) return;
          this.cache.delete(sessionId);
          this.cacheBytes.delete(sessionId);
          await this.load(sessionId);
          this.cache.delete(sessionId);
          this.cacheBytes.delete(sessionId);
        });
        this.writes.set(sessionId, maintenance.catch(() => undefined));
        await maintenance;
      }
    } catch {
      // Retention is best-effort maintenance; request paths report read failures.
    }
  }

  private async pruneFilesNow(): Promise<void> {
    this.lastPrune = Date.now();
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const files = await readdir(this.root, { withFileTypes: true });
    const candidates = (await Promise.all(files.filter((entry) => entry.isFile() && /^dsh-[A-Za-z0-9-]+\.jsonl$/u.test(entry.name)).map(async (entry) => {
      const file = path.join(this.root, entry.name);
      const metadata = await stat(file);
      return { file, size: metadata.size, modified: metadata.mtimeMs };
    }))).sort((a, b) => b.modified - a.modified);
    let bytes = 0;
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const expired = candidate.modified < Date.now() - MAX_AGE_MS;
      const overBudget = bytes + candidate.size > MAX_TOTAL_BYTES;
      if ((this.activeFiles.get(candidate.file) ?? 0) === 0 && (expired || index >= MAX_SESSION_FILES || overBudget)) {
        await unlink(candidate.file).catch(() => undefined);
        const sessionId = path.basename(candidate.file, ".jsonl");
        this.cache.delete(sessionId);
        this.cacheBytes.delete(sessionId);
      } else {
        bytes += candidate.size;
      }
    }
  }
}
