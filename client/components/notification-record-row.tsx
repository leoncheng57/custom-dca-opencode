import { Link } from "react-router-dom";

import { Badge, type BadgeVariant } from "../ds/badge.js";
import { cn } from "../ds/utils.js";
import type { NotificationRecord, NotifyEvent } from "../lib/api.js";
import { formatClockTime, formatRelative } from "../lib/derive.js";
import { sessionRoute } from "../lib/notificationGroups.js";

export const KIND_VARIANT: Record<NotifyEvent, BadgeVariant> = {
  idle: "neutral",
  error: "danger",
  abort: "warning",
  permission: "info",
  question: "info",
  parked: "warning",
};

export function projectName(directory?: string): string {
  return directory?.split("/").filter(Boolean).at(-1) ?? "unknown project";
}

/** Chip copy for the two categories the filters act on. */
export const SUPPRESSION_LABEL = {
  "auto-permissions": "auto-approved",
  subagent: "sub-agent",
} as const;

/**
 * Character-truncated rather than CSS-truncated: the metadata line holds
 * several fields, and letting one long title consume the row would push the
 * delivery and resolution state out of view. The full title stays in the
 * element's tooltip.
 */
export function truncateSessionTitle(title: string, max: number): string {
  const collapsed = title.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1).trimEnd()}\u2026` : collapsed;
}

/** Plain-language delivery summary. Never claims a browser actually rendered it. */
export function deliverySummary(record: NotificationRecord): string {
  if (record.delivery.suppressed === "auto-permissions") return "suppressed by auto permissions";
  if (record.delivery.suppressed === "subagent") return "suppressed as sub-agent activity";
  const parts = [
    record.delivery.ntfy === "sent"
      ? "ntfy sent"
      : record.delivery.ntfy === "pending"
        ? "ntfy pending"
      : record.delivery.ntfy === "failed"
        ? `ntfy failed: ${record.delivery.ntfyError ?? "unknown error"}`
        : "ntfy off",
    record.delivery.desktop === "allowed" ? "desktop allowed" : "desktop off",
    record.delivery.webPush === "sent"
      ? "PWA push sent"
      : record.delivery.webPush === "pending"
        ? "PWA push pending"
      : record.delivery.webPush === "partial"
        ? `PWA push partially sent: ${record.delivery.webPushError ?? "unknown error"}`
      : record.delivery.webPush === "failed"
        ? `PWA push failed: ${record.delivery.webPushError ?? "unknown error"}`
        : "PWA push off",
  ];
  return parts.join(" · ");
}

export function resolutionSummary(record: NotificationRecord): string {
  if (record.resolvedAt === undefined) return record.parkedAt ? "unresolved · parked" : "unresolved";
  return `${record.resolvedBy ?? "resolved"}`;
}

/** Safe action copy for new records, plus durable fallbacks for v1 history. */
export function notificationAction(record: NotificationRecord): string {
  if (record.delivery.suppressed === "auto-permissions") return "Auto-approved before you were notified";
  if (record.delivery.suppressed === "subagent") return "Sub-agent activity was recorded but not sent";
  if (record.displayBody) return record.displayBody;
  if (record.kind === "permission") return "Needs your approval";
  if (record.kind === "question") return "Needs your answer";
  if (record.kind === "idle") return "Finished its turn and is waiting for you";
  if (record.kind === "error") return "Stopped with an error";
  if (record.kind === "parked") return "Still waiting for approval";
  return "Stopped at your request";
}

/**
 * One history row, shared by the full history page and the nav popover so both
 * surfaces stay consistent. `compact` folds the fixed timestamp column into the
 * metadata line, which is what makes the row survive a ~360px popover column.
 *
 * `grouped` marks a row rendered under a session header that already names the
 * session and links to it. Repeating the title there was the clutter grouping
 * exists to remove, so the row spends its first line on what actually
 * distinguishes it from its siblings.
 */
export function NotificationRecordRow({
  record,
  onResolvedChange,
  compact = false,
  grouped = false,
  onNavigate,
}: {
  record: NotificationRecord;
  onResolvedChange: (id: string, resolved: boolean) => void;
  compact?: boolean;
  grouped?: boolean;
  /** Fired when the row navigates, so a host overlay can dismiss itself. */
  onNavigate?: () => void;
}) {
  const timestamp = new Date(record.at).toISOString();
  const active = record.resolvedAt === undefined;
  const resolution = resolutionSummary(record);
  const relative = formatRelative(timestamp) || formatClockTime(timestamp);
  const suppressed = record.delivery.suppressed;
  // The session title identifies the work. IDs remain structural link data and
  // are intentionally never rendered in the normal notification copy.
  const sessionLabel = record.sessionTitle
    ? truncateSessionTitle(record.sessionTitle, compact ? 40 : 64)
    : undefined;
  const action = notificationAction(record);
  const heading = grouped ? action : (sessionLabel ?? record.title);
  // Grouped or not, the row's first line is what the reader aims at to reach
  // the work. Grouping moved the session title into the header; it must not
  // also have taken the row's ability to navigate.
  const route = sessionRoute(record);
  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-[var(--color-border-default)] last:border-0",
        compact ? "gap-2 p-2" : "p-3",
      )}
      data-testid="opencode-notification-record"
      data-kind={record.kind}
      data-active={active ? "true" : "false"}
      data-suppressed={suppressed ?? "none"}
    >
      {!compact && (
        <time
          dateTime={timestamp}
          title={new Date(record.at).toLocaleString()}
          className="w-16 shrink-0 pt-0.5 text-[10px] tabular-nums text-[var(--color-text-muted)]"
        >
          {relative}
        </time>
      )}
      <Badge variant={KIND_VARIANT[record.kind]} className="mt-0.5 shrink-0">
        {record.kind}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm">
          <span
            className="min-w-0 truncate"
            {...(grouped
              ? { "data-testid": "opencode-notification-action" }
              : sessionLabel
                ? { title: record.sessionTitle, "data-testid": "opencode-notification-session" }
                : {})}
          >
            {route ? (
              <Link
                className="underline underline-offset-2"
                to={route}
                onClick={onNavigate}
                data-testid="opencode-notification-link"
              >
                {heading}
              </Link>
            ) : (
              heading
            )}
          </span>
          {/* Names why a suppressed row is on screen at all — without it, an
              unhidden auto-approved record looks like a request awaiting a
              decision that was in fact never asked. */}
          {suppressed && (
            <Badge variant="neutral" className="shrink-0" data-testid="opencode-notification-suppression">
              {SUPPRESSION_LABEL[suppressed]}
            </Badge>
          )}
        </p>
        {!grouped && (
          <p className="truncate text-xs text-[var(--color-text-muted)]" data-testid="opencode-notification-action">{action}</p>
        )}
        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
          {compact && (
            <>
              <time dateTime={timestamp} title={new Date(record.at).toLocaleString()} className="tabular-nums">
                {relative}
              </time>
              {" · "}
            </>
          )}
          {projectName(record.directory)}
          {/* The popover row has one line to spend and the session title is
              the field that says which work is waiting, so delivery and
              resolution detail stays on the full history page — the chip and
              the checkbox already carry their headline. Parking is the
              exception: it is the only escalation this row can report. */}
          {compact
            ? record.parkedAt
              ? " · parked"
              : ""
            : ` · ${deliverySummary(record)}${resolution ? ` · ${resolution}` : ""}`}
        </p>
      </div>
      <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        <input
          type="checkbox"
          checked={!active}
          onChange={(event) => onResolvedChange(record.id, event.target.checked)}
          data-testid="opencode-notification-resolved"
        />
        <span className={compact ? "sr-only" : undefined}>Resolved</span>
      </label>
    </li>
  );
}
