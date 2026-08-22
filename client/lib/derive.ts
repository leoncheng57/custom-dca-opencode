// client/lib/derive.ts
//
// Backend-neutral derivations over TranscriptEvent[]. Nothing here knows what
// OpenCode is — that is the point. These are the functions that survived the
// migration from the OpenHands runner unchanged in spirit, and they will
// survive the next one too.

import type { ToolEvent, TranscriptEvent } from "./transcript.js";

// ── Merge ───────────────────────────────────────────────────────────────────

/**
 * Fingerprint of everything that can change about an event after first sight.
 *
 * CRITICAL: OpenCode tool parts **mutate in place** — a call goes
 * pending → running → completed and its `output` grows as it streams. The
 * predecessor's log was append-only, so it could treat "is this id new?" as
 * "did anything change?". Doing that here freezes tool chips at `running`
 * forever. Compare content, not just presence.
 */
function fingerprint(event: TranscriptEvent): string {
  switch (event.kind) {
    case "tool":
      return `${event.status}|${event.output ?? ""}|${event.error ?? ""}|${event.durationMs ?? ""}`;
    case "user":
      return `${event.text}|${event.reminders.map((reminder) => `${reminder.name}:${reminder.body}`).join("|")}`;
    case "agent":
    case "thought":
      return event.text;
    case "status":
      return `${event.label}|${event.detail ?? ""}`;
    case "error":
      return event.message;
  }
}

/**
 * Reconcile a freshly normalized transcript with what we already have.
 *
 * Returns the SAME array reference when nothing changed, so downstream
 * `useMemo`/`memo` boundaries do not invalidate on every poll.
 */
export function mergeEvents(
  previous: TranscriptEvent[],
  incoming: TranscriptEvent[],
): TranscriptEvent[] {
  if (incoming.length === 0) return previous.length === 0 ? previous : [];

  const previousById = new Map(previous.map((event) => [event.id, event]));
  const byId = new Map<string, TranscriptEvent>();

  let changed = previous.length !== incoming.length;
  for (const event of incoming) {
    const existing = previousById.get(event.id);
    if (!existing || fingerprint(existing) !== fingerprint(event)) {
      changed = true;
      byId.set(event.id, event);
    } else {
      byId.set(event.id, existing);
    }
  }
  if (!changed) return previous;

  // ISO timestamps are fixed-width, so lexicographic order is chronological.
  // Id is a deterministic tiebreak for events sharing a millisecond.
  return [...byId.values()].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
}

// ── Grouping ────────────────────────────────────────────────────────────────

export type DisplayItem =
  | { type: "event"; id: string; event: TranscriptEvent }
  | { type: "actionGroup"; id: string; calls: ToolEvent[] };

/**
 * Only finished, successful calls collapse. Errors and in-flight calls stay
 * visible — nothing important should hide behind a chevron.
 */
function isCollapsible(event: TranscriptEvent): event is ToolEvent {
  // A delegation stays visible even when it succeeded: it is the only route
  // from a parent transcript to the child that did the work, and folding it
  // into "3 actions completed" makes that work unreachable from here.
  return event.kind === "tool" && event.status === "completed" && !event.childSessionId;
}

/**
 * Fold consecutive successful tool calls into one "N actions completed" row.
 *
 * The group id is keyed on the FIRST call, which never changes as the run
 * grows across polls — that is what keeps a user's expand/collapse choice
 * stable while the agent is still working.
 */
export function collapseActionGroups(
  events: TranscriptEvent[],
  minGroupSize = 2,
): DisplayItem[] {
  const out: DisplayItem[] = [];
  let run: ToolEvent[] = [];

  const flush = (): void => {
    if (run.length >= minGroupSize) {
      out.push({ type: "actionGroup", id: `group-${run[0].id}`, calls: run });
    } else {
      out.push(...run.map((event) => ({ type: "event" as const, id: event.id, event })));
    }
    run = [];
  };

  for (const event of events) {
    if (isCollapsible(event)) {
      run.push(event);
      continue;
    }
    flush();
    out.push({ type: "event", id: event.id, event });
  }
  flush();
  return out;
}

// ── Running activity ────────────────────────────────────────────────────────

export type RunningActivity =
  | { kind: "tool"; name: string; detail: string; since: string | null }
  | { kind: "thinking"; since: string | null };

/**
 * What the agent appears to be doing right now.
 *
 * An unfinished call deeper in history is stale, not running — hence the
 * `break` rather than a full scan.
 */
export function runningActivity(events: TranscriptEvent[]): RunningActivity {
  let latest: string | null = null;
  for (const event of events) {
    if (!latest || event.timestamp > latest) latest = event.timestamp;
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.kind === "status") continue; // separators are not activity
    if (event.kind === "tool" && (event.status === "running" || event.status === "pending")) {
      return {
        kind: "tool",
        name: event.name,
        detail: event.detail ?? event.title ?? "",
        since: event.timestamp,
      };
    }
    break;
  }
  return { kind: "thinking", since: latest };
}

// ── Command audit ───────────────────────────────────────────────────────────

export type CommandCategory = "command" | "edit" | "read" | "other";

export interface CommandEntry {
  /** Equals the transcript row's data-event-id, so jump-to-event works. */
  id: string;
  category: CommandCategory;
  name: string;
  text: string;
  timestamp: string;
  status: "ok" | "error" | "pending";
  outputPreview?: string;
}

export function serializeCommands(commands: CommandEntry[]): string {
  return ["#!/usr/bin/env bash", "set -euo pipefail", "", ...commands
    .filter((command) => command.category === "command")
    .flatMap((command) => [`# ${command.status} at ${command.timestamp}`, command.text, ""])].join("\n");
}

// Narrow on purpose: a loose /file/ would swallow unrelated tools. Anything
// unmatched falls through to "other" and is still listed, so a miss only
// affects filtering, never visibility.
const COMMAND_TOOLS = /^(bash|shell)$|terminal/i;
const EDIT_TOOLS = /^(edit|write|patch|apply_patch)$|str_replace/i;
const READ_TOOLS = /^(read|grep|glob|list|webfetch|websearch)$/i;

function categorize(name: string): CommandCategory {
  if (COMMAND_TOOLS.test(name)) return "command";
  if (EDIT_TOOLS.test(name)) return "edit";
  if (READ_TOOLS.test(name)) return "read";
  return "other";
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}

/**
 * The audit trail, derived from the same events the transcript renders — so
 * the two views can never disagree about what the agent did.
 */
export function extractCommands(events: TranscriptEvent[]): CommandEntry[] {
  const out: CommandEntry[] = [];
  for (const event of events) {
    if (event.kind !== "tool") continue;
    const text = event.detail ?? event.title;
    if (!text) continue;
    out.push({
      id: event.id,
      category: categorize(event.name),
      name: event.name,
      text,
      timestamp: event.timestamp,
      status:
        event.status === "completed" ? "ok" : event.status === "error" ? "error" : "pending",
      ...(event.output ? { outputPreview: firstLine(event.output).slice(0, 120) } : {}),
    });
  }
  return out;
}

// ── Merge-request detection ─────────────────────────────────────────────────

// Bounded deliberately: matches end at the iid, so query strings, fragments,
// tab segments (/diffs, /files) and trailing punctuation are never captured.
// ')' and ']' are excluded so markdown-wrapped links terminate correctly.
const MR_URL_RE =
  /https?:\/\/[^\s)\]>"']+\/-\/merge_requests\/\d+|https?:\/\/github\.com\/[^\s)\]>"'/]+\/[^\s)\]>"'/]+\/pull\/\d+/g;

function scanText(text: string | undefined, seen: Set<string>, out: string[]): void {
  if (!text) return;
  for (const match of text.matchAll(MR_URL_RE)) {
    const url = match[0].replace(/\/+$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
}

/** Merge-request / pull-request URLs the agent mentioned, in first-seen order. */
export function extractMrUrls(events: TranscriptEvent[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const event of events) {
    switch (event.kind) {
      case "user":
      case "agent":
      case "thought":
        scanText(event.text, seen, out);
        break;
      case "tool":
        scanText(event.detail, seen, out);
        scanText(event.title, seen, out);
        scanText(event.output, seen, out);
        scanText(event.error, seen, out);
        break;
      case "status":
        scanText(event.label, seen, out);
        scanText(event.detail, seen, out);
        break;
      case "error":
        scanText(event.message, seen, out);
        break;
    }
  }
  return out;
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** "3.2s" under a minute, "2m 05s" above it. */
export function formatDurationMs(ms: number | undefined): string | null {
  if (typeof ms !== "number" || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/** Relative label for a timestamp, e.g. "just now", "4m ago". */
export function formatRelative(timestamp: string, now = Date.now()): string {
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatClockTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
