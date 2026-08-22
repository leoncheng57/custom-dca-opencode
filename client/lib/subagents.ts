// client/lib/subagents.ts
//
// Pure presentation logic for delegated work. Two jobs:
//
//   1. Turn a flat session list into a roots-first tree. The flat list is not
//      a cosmetic problem — 124 of 149 sessions in one audited project
//      directory were children, so an unstructured list is ~83% noise and the
//      root a human actually started is impossible to find.
//   2. Put words to a derived state. The backend deliberately reports
//      `unknown` when it cannot tell whether a child finished, and that only
//      helps if the UI explains *why* instead of rendering an unexplained
//      shrug.

import type { SessionSummary, SubagentEvidence, SubagentState } from "./api.js";

export interface SessionRow {
  session: SessionSummary;
  /** 0 for a root; one more than its parent otherwise. */
  depth: number;
}

/** Indent stops. Beyond this the rows would have no usable title column left. */
export const MAX_SESSION_DEPTH = 3;

/**
 * Order a directory listing depth-first: each root followed by everything it
 * delegated, recursively.
 *
 * Three properties this guarantees, each of which a naive one-level grouping
 * gets wrong:
 *
 *   - **Nothing is lost.** OpenCode defaults `subagent_depth` to 1, which
 *     prevents nested delegation; this repository sets it to 3, so a
 *     grandchild must appear. Any session not reached
 *     from a root — because its parent is archived, in another directory, or
 *     part of a corrupt parent cycle — is emitted as a root rather than
 *     dropped. Vanishing from the only page that lists it is the worst
 *     outcome available.
 *   - **Nothing is duplicated.** A `seen` set makes that true even if upstream
 *     ever returns a parent chain that loops.
 *   - **Order is stable.** Roots and siblings keep listing order, so the list
 *     does not reshuffle under the reader on every poll.
 */
export function buildSessionRows(sessions: SessionSummary[]): SessionRow[] {
  const present = new Set(sessions.map((session) => session.id));
  const childrenByParent = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    if (!session.parentID || !present.has(session.parentID)) continue;
    const siblings = childrenByParent.get(session.parentID);
    if (siblings) siblings.push(session);
    else childrenByParent.set(session.parentID, [session]);
  }

  const rows: SessionRow[] = [];
  const seen = new Set<string>();

  const walk = (session: SessionSummary, depth: number): void => {
    if (seen.has(session.id)) return;
    seen.add(session.id);
    rows.push({ session, depth });
    for (const child of childrenByParent.get(session.id) ?? []) walk(child, depth + 1);
  };

  for (const session of sessions) {
    if (session.parentID && present.has(session.parentID)) continue;
    walk(session, 0);
  }
  // A parent cycle leaves members unreachable from any root. Surface them
  // rather than letting a data fault silently hide live work.
  for (const session of sessions) walk(session, 0);

  return rows;
}

/** True when this session was delegated to by another one. */
export function isSubagentSession(session: Pick<SessionSummary, "parentID">): boolean {
  return typeof session.parentID === "string" && session.parentID.length > 0;
}

export const SUBAGENT_STATE_LABELS: Record<SubagentState, string> = {
  launched: "launched",
  running: "running",
  completed: "completed",
  failed: "failed",
  unknown: "unknown",
};

export type SubagentTone = "info" | "success" | "danger" | "muted";

export const SUBAGENT_STATE_TONES: Record<SubagentState, SubagentTone> = {
  launched: "info",
  running: "info",
  completed: "success",
  failed: "danger",
  unknown: "muted",
};

/**
 * Plain-language provenance for a derived state.
 *
 * Deliberately says which artefact was read. "Completed" inferred from a
 * parent task part is a much weaker claim than one read off the child's own
 * final turn, and a human triaging a stuck orchestration needs to know which
 * of the two they are looking at.
 */
export function subagentEvidenceLabel(evidence: SubagentEvidence): string {
  switch (evidence) {
    case "session-status":
      return "Reported busy by the connected agent server.";
    case "child-transcript":
      return "Read from the sub-agent's own final turn.";
    case "parent-completion":
      return "Reported by a completion notice in this transcript.";
    case "parent-task-part":
      return "Read from the delegating tool call in this transcript.";
    case "launch-only":
      return "Launched; no progress reported back yet.";
    case "no-terminal-evidence":
      return "No finishing evidence anywhere. It may have been cancelled, or the agent server may have restarted while it ran.";
  }
}

/** Counts per state, for a compact summary line. */
export function summarizeSubagentStates(
  tasks: Array<{ state: SubagentState }>,
): Array<{ state: SubagentState; count: number }> {
  const order: SubagentState[] = ["running", "launched", "failed", "unknown", "completed"];
  return order
    .map((state) => ({ state, count: tasks.filter((task) => task.state === state).length }))
    .filter((entry) => entry.count > 0);
}
