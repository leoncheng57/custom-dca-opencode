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

export interface SessionTreeNode {
  session: SessionSummary;
  children: SessionTreeNode[];
}

/** Indent stops. Beyond this the rows would have no usable title column left. */
export const MAX_SESSION_DEPTH = 3;

/**
 * Project a session list into stable roots and nested descendants.
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
export function sessionTreeKey(session: Pick<SessionSummary, "directory" | "id">): string {
  return `${session.directory}\u0000${session.id}`;
}

export function buildSessionTree(
  sessions: SessionSummary[],
  selected: SessionSummary[] = sessions,
): SessionTreeNode[] {
  const sessionsByKey = new Map<string, SessionSummary>();
  for (const session of sessions) {
    const key = sessionTreeKey(session);
    if (!sessionsByKey.has(key)) sessionsByKey.set(key, session);
  }

  const parentByChild = new Map<string, string>();
  const childrenByParent = new Map<string, string[]>();

  for (const [key, session] of sessionsByKey) {
    if (!session.parentID) continue;
    const parentKey = `${session.directory}\u0000${session.parentID}`;
    if (parentKey === key || !sessionsByKey.has(parentKey)) continue;
    parentByChild.set(key, parentKey);
    const siblings = childrenByParent.get(parentKey);
    if (siblings) siblings.push(key);
    else childrenByParent.set(parentKey, [key]);
  }

  const included = new Set(
    selected
      .map(sessionTreeKey)
      .filter((key) => sessionsByKey.has(key)),
  );
  const selectedOrder = new Map(selected.map((session, index) => [sessionTreeKey(session), index]));
  const includeFamily = (key: string): void => {
    if (!sessionsByKey.has(key)) return;
    let ancestor = parentByChild.get(key);
    const ancestors = new Set([key]);
    while (ancestor && !ancestors.has(ancestor)) {
      included.add(ancestor);
      ancestors.add(ancestor);
      ancestor = parentByChild.get(ancestor);
    }
    const descendants = [...(childrenByParent.get(key) ?? [])];
    while (descendants.length > 0) {
      const child = descendants.shift();
      if (!child || included.has(child)) continue;
      included.add(child);
      descendants.push(...(childrenByParent.get(child) ?? []));
    }
  };
  for (const key of [...included]) includeFamily(key);
  // Ancestor context is itself expandable, so include its loaded descendants
  // as well. This keeps sibling navigation and child counts honest.
  for (const key of [...included]) includeFamily(key);

  const seen = new Set<string>();
  const walk = (key: string): SessionTreeNode | null => {
    if (seen.has(key) || !included.has(key)) return null;
    const session = sessionsByKey.get(key);
    if (!session) return null;
    seen.add(key);
    return {
      session,
      children: (childrenByParent.get(key) ?? [])
        .map(walk)
        .filter((child): child is SessionTreeNode => child !== null),
    };
  };

  const roots: SessionTreeNode[] = [];
  for (const key of sessionsByKey.keys()) {
    if (!included.has(key)) continue;
    const parentKey = parentByChild.get(key);
    if (parentKey && included.has(parentKey)) continue;
    const root = walk(key);
    if (root) roots.push(root);
  }
  // A parent cycle leaves members unreachable from any root. Surface them
  // rather than letting a data fault silently hide live work.
  for (const key of sessionsByKey.keys()) {
    const root = walk(key);
    if (root) roots.push(root);
  }

  const priority = (node: SessionTreeNode): number => Math.min(
    selectedOrder.get(sessionTreeKey(node.session)) ?? Number.POSITIVE_INFINITY,
    ...node.children.map(priority),
  );
  roots.sort((left, right) => priority(left) - priority(right));

  return roots;
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
