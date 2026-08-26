import type { DshTrajectoryCategory, DshTrajectoryEvent } from "./api.js";

export type DshTrajectoryFilter = "all" | "boundaries" | "requests" | "messages" | "tools" | "compaction" | "children" | "failures";

export const DSH_TRAJECTORY_FILTERS: Array<{ id: DshTrajectoryFilter; label: string; categories?: DshTrajectoryCategory[] }> = [
  { id: "all", label: "All" },
  { id: "boundaries", label: "Turns", categories: ["turn"] },
  { id: "requests", label: "Requests", categories: ["request"] },
  { id: "messages", label: "Messages", categories: ["message"] },
  { id: "tools", label: "Tools", categories: ["tool"] },
  { id: "compaction", label: "Compaction", categories: ["compaction"] },
  { id: "children", label: "Children", categories: ["child"] },
  { id: "failures", label: "Failures", categories: ["error"] },
];

export function filterDshTrajectory(events: DshTrajectoryEvent[], filter: DshTrajectoryFilter, query: string): DshTrajectoryEvent[] {
  const categories = DSH_TRAJECTORY_FILTERS.find((item) => item.id === filter)?.categories;
  const needle = query.trim().toLocaleLowerCase();
  return events.filter((event) => {
    if (categories && !categories.includes(event.category)) return false;
    if (!needle) return true;
    const metadata = event.metadata;
    return [
      event.type, event.title, event.summary, event.source,
      metadata?.provider, metadata?.model, metadata?.callId,
      metadata?.compactionId, metadata?.childSessionId, metadata?.reason,
    ].some((value) => value?.toLocaleLowerCase().includes(needle));
  });
}

export function trajectoryCategoryLabel(category: DshTrajectoryCategory): string {
  return category === "child" ? "Child" : category.charAt(0).toUpperCase() + category.slice(1);
}

export interface DshTrajectoryGroup { id: string; label: string; events: DshTrajectoryEvent[] }

export function groupDshTrajectory(events: DshTrajectoryEvent[]): DshTrajectoryGroup[] {
  const groups: DshTrajectoryGroup[] = [];
  let currentTurn: number | undefined;
  let currentStream: string | undefined;
  for (const event of events) {
    const turn = event.metadata?.turn;
    const stream = event.nativeSessionId;
    if (groups.length === 0 || (turn !== undefined && (turn !== currentTurn || stream !== currentStream))) {
      currentTurn = turn;
      currentStream = stream;
      groups.push({
        id: turn === undefined ? `session-${event.id}` : `turn-${turn}-${event.id}`,
        label: turn === undefined ? "Session events" : `Turn ${turn}${stream ? ` · ${stream}` : ""}`,
        events: [],
      });
    }
    groups.at(-1)!.events.push(event);
  }
  return groups;
}

export function mergeDshTrajectoryEvents(current: DshTrajectoryEvent[], incoming: DshTrajectoryEvent[]): DshTrajectoryEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.observationSeq - b.observationSeq).slice(-5_000);
}

export interface DshTrajectoryTiming { durationMs?: number; firstTokenMs?: number }

export function deriveDshTrajectoryTiming(events: DshTrajectoryEvent[]): Map<string, DshTrajectoryTiming> {
  const result = new Map<string, DshTrajectoryTiming>();
  const turns = new Map<string, number>();
  const steps = new Map<string, { started: number; firstToken?: number }>();
  const calls = new Map<string, number>();
  for (const event of events) {
    const time = Date.parse(event.nativeTime ?? event.observedAt);
    if (!Number.isFinite(time)) continue;
    const metadata = event.metadata;
    const turnKey = metadata?.turn === undefined ? undefined : `${event.nativeSessionId ?? "root"}:${metadata.turn}`;
    if (event.type === "turn/start" && turnKey) turns.set(turnKey, time);
    if (event.type === "turn/end" && metadata?.turn !== undefined) {
      const started = turnKey ? turns.get(turnKey) : undefined;
      if (started !== undefined) result.set(event.id, { durationMs: Math.max(0, time - started) });
    }
    if (metadata?.turn !== undefined && metadata.step !== undefined) {
      const key = `${event.nativeSessionId ?? "root"}:${metadata.turn}:${metadata.step}`;
      if (event.type === "step/start") steps.set(key, { started: time });
      const step = steps.get(key);
      if (event.type === "assistant/chunk" && step && step.firstToken === undefined && (metadata.reason === "text-delta" || metadata.reason === "reasoning-delta")) step.firstToken = time;
      if ((event.type === "assistant/message" || event.type === "step/end") && step) {
        result.set(event.id, { durationMs: Math.max(0, time - step.started), ...(step.firstToken === undefined ? {} : { firstTokenMs: Math.max(0, step.firstToken - step.started) }) });
      }
    }
    if (event.type === "tool/call" && metadata?.callId) calls.set(`${event.nativeSessionId ?? "root"}:${metadata.callId}`, time);
    if (event.type === "tool/result" && metadata?.callId) {
      const started = calls.get(`${event.nativeSessionId ?? "root"}:${metadata.callId}`);
      if (started !== undefined) result.set(event.id, { durationMs: Math.max(0, time - started) });
    }
  }
  return result;
}
