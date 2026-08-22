// client/lib/useSubagents.ts
//
// Data plumbing for the delegated-work panel.
//
// The ledger is derived server-side from several upstream calls, so it is far
// more expensive than a todo list and must not ride the 3s transcript poll.
// It loads when the panel is actually on screen and refreshes on a slow timer
// only while something is still open — a session whose children have all
// settled stops polling entirely, because nothing can change without a new
// delegation, and a new delegation arrives as a transcript event anyway.

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type SubagentReport } from "./api.js";

/** Slow on purpose: sub-agent state changes on human timescales. */
export const SUBAGENT_POLL_MS = 10_000;

export interface SubagentsState {
  report: SubagentReport | null;
  loading: boolean;
  error: string | null;
  /** Child session id currently being aborted, if any. */
  busyChild: string | null;
  promoting: boolean;
  /** Failure from an abort or promote, cleared on the next attempt. */
  actionError: string | null;
  refresh: () => void;
  abortChild: (childID: string) => void;
  promote: () => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useSubagents(directory: string, sessionID: string, active: boolean): SubagentsState {
  const [report, setReport] = useState<SubagentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyChild, setBusyChild] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const scope = `${directory}\u0000${sessionID}`;
  const generation = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  // A directory or session change invalidates every response still in flight;
  // without this a slow reply from the previous session can paint over the new
  // one, which reads as sub-agents teleporting between sessions.
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    generation.current += 1;
  }

  const load = useCallback((showSpinner: boolean) => {
    if (!directory || !sessionID) return;
    const id = (generation.current += 1);
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    if (showSpinner) setLoading(true);

    void api.subagents(directory, sessionID, controller.signal)
      .then((value) => {
        if (generation.current !== id) return;
        setReport(value);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (generation.current !== id || controller.signal.aborted) return;
        setError(message(cause));
      })
      .finally(() => {
        if (generation.current === id) setLoading(false);
      });
  }, [directory, sessionID]);

  useEffect(() => {
    setReport(null);
    setError(null);
    setActionError(null);
    setBusyChild(null);
  }, [scope]);

  useEffect(() => {
    if (!active) return;
    load(true);
  }, [active, load, scope]);

  const openWork = report?.tasks.some(
    (task) => task.state === "running" || task.state === "launched",
  ) ?? false;

  useEffect(() => {
    if (!active || !openWork) return;
    const timer = setInterval(() => load(false), SUBAGENT_POLL_MS);
    return () => clearInterval(timer);
  }, [active, load, openWork]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const abortChild = useCallback((childID: string) => {
    setBusyChild(childID);
    setActionError(null);
    void api.abortSubagent(directory, sessionID, childID)
      .then(() => load(false))
      .catch((cause: unknown) => setActionError(`Could not stop the sub-agent: ${message(cause)}`))
      .finally(() => setBusyChild(null));
  }, [directory, load, sessionID]);

  const promote = useCallback(() => {
    setPromoting(true);
    setActionError(null);
    void api.backgroundSubagents(directory, sessionID)
      .then(() => load(false))
      .catch((cause: unknown) => setActionError(message(cause)))
      .finally(() => setPromoting(false));
  }, [directory, load, sessionID]);

  return {
    report,
    loading,
    error,
    busyChild,
    promoting,
    actionError,
    refresh: () => load(true),
    abortChild,
    promote,
  };
}
