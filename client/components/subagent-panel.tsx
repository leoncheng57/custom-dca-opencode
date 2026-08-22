// client/components/subagent-panel.tsx
//
// The delegated-work panel: every sub-agent this session started, what it is
// doing, and how we know.
//
// The design constraint that shapes this file is that some answers are simply
// not knowable. A cancelled child, or one whose owning server restarted, has
// no finishing evidence anywhere upstream. Rather than picking a plausible
// state, those rows say `unknown` and explain what was checked — see the
// evidence line under each one.

import { Badge, type BadgeVariant } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { formatCost, type SubagentReport, type SubagentTask } from "../lib/api.js";
import { formatRelative } from "../lib/derive.js";
import {
  SUBAGENT_STATE_LABELS,
  SUBAGENT_STATE_TONES,
  subagentEvidenceLabel,
  summarizeSubagentStates,
} from "../lib/subagents.js";
import { Link } from "react-router-dom";

const TONE_VARIANT: Record<string, BadgeVariant> = {
  info: "info",
  success: "success",
  danger: "danger",
  muted: "neutral",
};

function StateBadge({ task }: { task: SubagentTask }) {
  return (
    <Badge
      variant={TONE_VARIANT[SUBAGENT_STATE_TONES[task.state]] ?? "neutral"}
      className="shrink-0 text-[9px]"
      data-testid="opencode-subagent-state"
    >
      {SUBAGENT_STATE_LABELS[task.state]}
    </Badge>
  );
}

function TaskRow({
  task,
  directory,
  busy,
  onAbort,
}: {
  task: SubagentTask;
  directory: string;
  busy: boolean;
  onAbort: (childID: string) => void;
}) {
  // Only work the connected server reports as busy can be stopped by it.
  // Offering Stop for an `unknown` row would promise control we do not have.
  const stoppable = task.state === "running";
  return (
    <li
      className="min-w-0 rounded border border-[var(--color-border-default)] p-2.5"
      data-testid="opencode-subagent-row"
      data-state={task.state}
      data-session={task.sessionID}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="min-w-0 flex-1 break-words text-sm font-medium">{task.title}</span>
        <StateBadge task={task} />
      </div>

      {task.description && task.description !== task.title && (
        <p className="mt-1 break-words text-xs text-[var(--color-text-muted)]">{task.description}</p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[var(--color-text-muted)]">
        {task.agent && <span data-testid="opencode-subagent-agent">agent: {task.agent}</span>}
        {task.background && <span data-testid="opencode-subagent-background">background</span>}
        {task.cost > 0 && <span className="tabular-nums">{formatCost(task.cost)}</span>}
        <span>{formatRelative(task.updatedAt)}</span>
      </div>

      <p className="mt-1.5 break-words text-[10px] leading-relaxed text-[var(--color-text-muted)]" data-testid="opencode-subagent-evidence">
        {subagentEvidenceLabel(task.evidence)}
      </p>

      {task.detail && task.state === "failed" && (
        <p className="mt-1 break-words text-[11px] text-[var(--color-text-danger)]" data-testid="opencode-subagent-detail">
          {task.detail}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {task.present ? (
          <Link
            to={`/sessions/${task.sessionID}?directory=${encodeURIComponent(directory)}`}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--color-text-info)] lg:min-h-0"
            data-testid="opencode-subagent-open"
          >
            Open transcript
          </Link>
        ) : (
          // A launch recorded a child that no longer exists upstream. Linking
          // to it would only produce a "session not found" page.
          <span className="text-[11px] text-[var(--color-text-muted)]" data-testid="opencode-subagent-missing">
            Session no longer exists.
          </span>
        )}
        {stoppable && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAbort(task.sessionID)}
            data-testid="opencode-subagent-abort"
          >
            {busy ? "Stopping..." : "Stop"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function SubagentPanel({
  directory,
  report,
  loading,
  error,
  busyChild,
  promoting,
  actionError,
  onRefresh,
  onAbort,
  onPromote,
}: {
  directory: string;
  report: SubagentReport | null;
  loading: boolean;
  error: string | null;
  busyChild: string | null;
  promoting: boolean;
  actionError: string | null;
  onRefresh: () => void;
  onAbort: (childID: string) => void;
  onPromote: () => void;
}) {
  const tasks = report?.tasks ?? [];
  const summary = summarizeSubagentStates(tasks);
  const canPromote = report?.capabilities.backgroundSubagents === true
    && tasks.some((task) => task.state === "running" && !task.background);

  return (
    <section className="space-y-3" data-testid="opencode-subagents">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          Delegated sub-agents
        </h2>
        <Button size="sm" variant="secondary" disabled={loading} onClick={onRefresh} data-testid="opencode-subagents-refresh">
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {summary.length > 0 && (
        <p className="flex flex-wrap gap-1.5" data-testid="opencode-subagents-summary">
          {summary.map((entry) => (
            <Badge
              key={entry.state}
              variant={TONE_VARIANT[SUBAGENT_STATE_TONES[entry.state]] ?? "neutral"}
              className="text-[9px]"
            >
              {entry.count} {SUBAGENT_STATE_LABELS[entry.state]}
            </Badge>
          ))}
        </p>
      )}

      {loading && !report && <p className="text-sm text-[var(--color-text-muted)]" role="status">Loading sub-agents...</p>}
      {error && <p className="break-words text-sm text-[var(--color-text-danger)]" role="alert" data-testid="opencode-subagents-error">Sub-agents unavailable: {error}</p>}
      {actionError && <p className="break-words text-sm text-[var(--color-text-danger)]" role="alert" data-testid="opencode-subagents-action-error">{actionError}</p>}

      {canPromote && (
        <div className="rounded border border-[var(--color-border-default)] p-2.5">
          <p className="text-xs text-[var(--color-text-muted)]">
            Running sub-agents are blocking this session. Move them to the background to keep working here.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={promoting}
            onClick={onPromote}
            data-testid="opencode-subagents-promote"
          >
            {promoting ? "Moving..." : "Run in background"}
          </Button>
        </div>
      )}

      {report && tasks.length === 0 && !error && (
        <p className="text-sm text-[var(--color-text-muted)]" data-testid="opencode-subagents-empty">
          This session has not delegated any work.
        </p>
      )}

      {tasks.length > 0 && (
        <ul className="space-y-2" data-testid="opencode-subagent-list">
          {tasks.map((task) => (
            <TaskRow
              key={task.sessionID}
              task={task}
              directory={directory}
              busy={busyChild === task.sessionID}
              onAbort={onAbort}
            />
          ))}
        </ul>
      )}

      {report?.truncated && (
        <p className="text-[11px] text-[var(--color-text-muted)]" data-testid="opencode-subagents-truncated">
          Older sub-agents were not checked for a finishing state; open one to see its transcript.
        </p>
      )}
    </section>
  );
}
