import * as React from "react";

import { cn } from "../ds/utils.js";
import type { SessionRunState } from "../lib/sessionRunState.js";

/**
 * Whether a session is working right now.
 *
 * Lived in Hub.tsx as a two-state boolean pill until the notification popover
 * needed the same answer (issue #288). Shared rather than reimplemented: a
 * second status treatment would be free to drift from this one, and "is it
 * still running?" has to mean the same thing wherever it is asked.
 *
 * Three states, not two. `running` and `idle` are answers; `unknown` is the
 * absence of one. `GET /session/status` is process-local, so a session the
 * connected process never reported on has no status the client can honestly
 * claim — printing `idle` there would be a confident falsehood about work that
 * may well be underway somewhere else. `unknown` is deliberately styled apart
 * from `idle` (dashed outline, no fill) rather than sharing its treatment, so
 * "we do not know" cannot be misread as "nothing is happening".
 */
const STATE_CLASS: Record<SessionRunState, string> = {
  running:
    "bg-[var(--color-background-surface-info-muted)] text-[var(--color-text-info)] border border-transparent",
  idle:
    "bg-[var(--color-background-surface-neutral-muted)] text-[var(--color-text-muted)] border border-transparent",
  unknown:
    "bg-transparent text-[var(--color-text-muted)] border border-dashed border-[var(--color-border-default)]",
};

const STATE_TITLE: Record<SessionRunState, string> = {
  running: "This session is working right now.",
  idle: "This session is not working right now.",
  // Names the reason rather than just the state: without it a dashed pill is
  // just a style, and the reader cannot tell a missing answer from a quiet one.
  unknown:
    "Status unknown. Session status is only reported for sessions the connected OpenCode process owns, so this may still be working.",
};

const STATE_LABEL: Record<SessionRunState, string> = {
  running: "running",
  idle: "idle",
  unknown: "unknown",
};

export const StatusPill = React.forwardRef<
  HTMLSpanElement,
  { status: SessionRunState; className?: string } & React.HTMLAttributes<HTMLSpanElement>
>(({ status, className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
      STATE_CLASS[status],
      className,
    )}
    title={STATE_TITLE[status]}
    data-testid="opencode-status-pill"
    data-status={status}
    {...props}
  >
    {STATE_LABEL[status]}
  </span>
));
StatusPill.displayName = "StatusPill";

/** Boolean callers (the Hub's own session list) keep their two-state source. */
export function runningState(running: boolean): SessionRunState {
  return running ? "running" : "idle";
}
