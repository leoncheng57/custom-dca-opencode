// client/lib/events.ts
//
// The adapter. OpenCode `{ info, parts }` messages in, frozen TranscriptEvent
// out. This is the ONLY file in the client that knows what an OpenCode Part
// looks like; see transcript.ts for why that matters.
//
// Shapes here were captured from a live 1.18.19 server rather than from the
// published docs, which lag the binary badly. Notes on the non-obvious bits:
//
//   - `reasoning.text` is plaintext, but `reasoning.metadata.anthropic.signature`
//     is an opaque provider artefact. We read text and drop metadata entirely.
//   - `patch` parts carry `{ hash, files[] }` — a reference, not a diff body.
//   - `file` parts are references with an optional `source.text` range, not
//     uploaded attachments.
//   - `tool.state.running.metadata.output` holds partial output mid-call, which
//     is what makes a live-updating tool row possible.
//   - `step-start` / `step-finish` are bookkeeping, not rows. step-finish is
//     where cost and tokens live.

import type {
  Attachment,
  InterruptedState,
  ToolStatus,
  Transcript,
  TranscriptEvent,
  UsageSnapshot,
} from "./transcript.js";

// ── Minimal structural types for what we consume ────────────────────────────
// Intentionally not imported from the SDK: the client bundle should not depend
// on server types, and these are narrower than the generated unions.

interface RawTime {
  start?: number;
  end?: number;
  created?: number;
  completed?: number;
}

interface RawToolState {
  status?: string;
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  time?: RawTime;
}

export interface RawPart {
  id?: string;
  messageID?: string;
  type?: string;
  // text
  text?: string;
  // tool
  callID?: string;
  tool?: string;
  state?: RawToolState;
  // reasoning
  time?: RawTime;
  // file
  mime?: string;
  filename?: string;
  url?: string;
  source?: { type?: string; path?: string; text?: { value?: string } };
  // patch
  hash?: string;
  files?: string[];
  // compaction
  auto?: boolean;
  // step-finish
  reason?: string;
  cost?: number;
  tokens?: RawTokens;
}

interface RawTokens {
  total?: number;
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

export interface RawMessageInfo {
  id?: string;
  role?: string;
  time?: RawTime;
  agent?: string;
  cost?: number;
  tokens?: RawTokens;
  finish?: string;
  error?: unknown;
}

export interface RawMessage {
  info?: RawMessageInfo;
  parts?: RawPart[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function iso(epochMs: number | undefined, fallback: number): string {
  return new Date(typeof epochMs === "number" ? epochMs : fallback).toISOString();
}

function duration(time: RawTime | undefined): number | undefined {
  if (!time || typeof time.start !== "number" || typeof time.end !== "number") return undefined;
  const ms = time.end - time.start;
  return ms >= 0 ? ms : undefined;
}

function fileAttachment(part: RawPart): Attachment {
  return {
    filename: part.filename || part.source?.path?.split("/").pop() || "file",
    mime: part.mime,
    url: part.url,
    path: part.source?.path,
  };
}

/**
 * A short, safe one-liner describing a tool's arguments.
 *
 * Deliberately conservative: tool inputs are arbitrary and can contain whole
 * file bodies (`content`, `new_str`, `patch`…). We allowlist the small scalar
 * fields that read well inline and skip everything else, rather than
 * stringifying the object and truncating — which is how the predecessor ended
 * up rendering giant JSON blobs into chips.
 */
export function toolDetail(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const preferred = [
    "command",
    "filePath",
    "path",
    "pattern",
    "query",
    "url",
    "description",
    "subagent_type",
  ];
  for (const key of preferred) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      const flat = value.replace(/\s+/g, " ").trim();
      return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
    }
  }
  return undefined;
}

function toolStatus(raw: string | undefined): ToolStatus {
  switch (raw) {
    case "pending":
    case "running":
    case "completed":
    case "error":
      return raw;
    default:
      // Unknown states are treated as in-flight rather than dropped: the event
      // union has grown before and will again.
      return "running";
  }
}

// ── Part → event ────────────────────────────────────────────────────────────

function normalizePart(
  part: RawPart,
  info: RawMessageInfo,
  index: number,
): TranscriptEvent | null {
  const messageId = part.messageID || info.id || "unknown";
  const id = part.id || `${messageId}:${index}`;
  const created = info.time?.created ?? Date.now();
  const isUser = info.role === "user";

  switch (part.type) {
    case "text": {
      const text = part.text?.trim();
      if (!text) return null;
      return isUser
        ? { kind: "user", id, messageId, timestamp: iso(created, created), text, attachments: [] }
        : { kind: "agent", id, messageId, timestamp: iso(created, created), text };
    }

    case "reasoning": {
      const text = part.text?.trim();
      // Encrypted-only reasoning yields no text; an empty Thought row is noise.
      // NB: part.metadata (Anthropic signature) is intentionally not read.
      if (!text) return null;
      return {
        kind: "thought",
        id,
        messageId,
        timestamp: iso(part.time?.start, created),
        text,
        durationMs: duration(part.time),
      };
    }

    case "tool": {
      const state = part.state || {};
      const status = toolStatus(state.status);
      return {
        kind: "tool",
        id,
        messageId,
        timestamp: iso(state.time?.start, created),
        status,
        name: part.tool || "tool",
        title: state.title,
        detail: toolDetail(state.input),
        // While running, partial output hides in state.metadata.output.
        output:
          state.output ??
          (typeof state.metadata?.output === "string" ? state.metadata.output : undefined),
        error: state.error,
        durationMs: duration(state.time),
        attachments: [],
      };
    }

    case "file": {
      // A file reference attaches to the surrounding turn rather than
      // rendering its own row; callers fold these into the adjacent event.
      return null;
    }

    case "patch": {
      const files = part.files ?? [];
      return {
        kind: "status",
        id,
        messageId,
        timestamp: iso(created, created),
        label: files.length === 1 ? "Edited 1 file" : `Edited ${files.length} files`,
        detail: files.length ? files.join(", ") : undefined,
      };
    }

    case "compaction": {
      return {
        kind: "status",
        id,
        messageId,
        timestamp: iso(created, created),
        label: part.auto ? "Context compacted automatically" : "Context compacted",
      };
    }

    // Bookkeeping, never rendered as rows.
    case "step-start":
    case "step-finish":
    case "snapshot":
      return null;

    default:
      // Forward compatibility: the Part union grows between releases and an
      // unknown type must never break the transcript.
      return null;
  }
}

function usageFrom(part: RawPart, messageId: string): UsageSnapshot | null {
  if (part.type !== "step-finish") return null;
  const tokens = part.tokens || {};
  return {
    messageId,
    cost: part.cost ?? 0,
    tokens: {
      input: tokens.input ?? 0,
      output: tokens.output ?? 0,
      reasoning: tokens.reasoning ?? 0,
      cacheRead: tokens.cache?.read ?? 0,
      cacheWrite: tokens.cache?.write ?? 0,
      total: tokens.total,
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect a run that died without finishing.
 *
 * `isRunning` must come from `GET /session/status`, which only knows about
 * sessions owned by the *current* server process — that is precisely what
 * distinguishes "still working" from "orphaned by a crash".
 *
 * A deliberate user abort produces an identical signature, so callers should
 * describe the state ("this run did not finish") rather than diagnose a cause.
 */
export function detectInterrupted(
  messages: RawMessage[],
  isRunning: boolean,
): InterruptedState {
  if (isRunning || messages.length === 0) return { interrupted: false };

  const last = messages[messages.length - 1]?.info;
  if (!last) return { interrupted: false };

  if (last.role === "user") return { interrupted: true, reason: "never-answered" };
  if (last.role === "assistant" && typeof last.time?.completed !== "number") {
    return { interrupted: true, reason: "incomplete-turn" };
  }
  return { interrupted: false };
}

/** Map one message's parts, folding file references into the turn. */
export function normalizeMessage(message: RawMessage): TranscriptEvent[] {
  const info = message.info || {};
  const parts = message.parts || [];
  const events: TranscriptEvent[] = [];
  const attachments = parts.filter((p) => p.type === "file").map(fileAttachment);

  parts.forEach((part, index) => {
    const event = normalizePart(part, info, index);
    if (event) events.push(event);
  });

  if (attachments.length) {
    // Attach to the first event that can hold files, so a user prompt with a
    // referenced file renders them together.
    const target = events.find((e) => e.kind === "user" || e.kind === "tool");
    if (target && "attachments" in target) target.attachments = attachments;
  }

  // A turn that errored with no parts still needs to say so.
  if (!events.length && info.error) {
    events.push({
      kind: "error",
      id: `${info.id ?? "unknown"}:error`,
      messageId: info.id ?? "unknown",
      timestamp: iso(info.time?.created, Date.now()),
      message:
        typeof info.error === "string"
          ? info.error
          : ((info.error as { message?: string })?.message ?? "The agent turn failed."),
    });
  }

  return events;
}

/** Map a full transcript fetch. */
export function normalizeTranscript(
  messages: RawMessage[],
  options: { isRunning?: boolean } = {},
): Transcript {
  const events: TranscriptEvent[] = [];
  const usage: UsageSnapshot[] = [];

  for (const message of messages) {
    events.push(...normalizeMessage(message));
    const messageId = message.info?.id ?? "unknown";
    for (const part of message.parts || []) {
      const snapshot = usageFrom(part, messageId);
      if (snapshot) usage.push(snapshot);
    }
  }

  return {
    events,
    usage,
    interrupted: detectInterrupted(messages, options.isRunning ?? false),
  };
}
