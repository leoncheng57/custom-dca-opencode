import { Check, Circle } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, type BadgeVariant } from "../ds/badge.js";
import { Button, buttonClasses } from "../ds/button.js";
import { cn } from "../ds/utils.js";
import type { NotificationRecord, NotifyEvent } from "../lib/api.js";
import { formatClockTime, formatRelative } from "../lib/derive.js";
import { sessionRoute } from "../lib/notificationGroups.js";
import { useNotificationCenter } from "../lib/useNotificationCenter.js";
import { StatusPill } from "./status-pill.js";

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
  "preference-off": "switched off",
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
  if (record.delivery.suppressed === "preference-off") return "this event kind is switched off everywhere";
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
  if (record.delivery.suppressed === "preference-off") return "Recorded, but this kind is switched off in every channel";
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
  // Read from the centre rather than drilled through every caller: the popover
  // reaches this row through two wrappers and the history page through one, and
  // a prop threaded down both paths is a prop two surfaces can forget to pass.
  // The hook returns an inert centre when no provider is mounted, so this stays
  // safe to render in isolation.
  const { sessionStatus } = useNotificationCenter();
  const status = sessionStatus(record.sessionID);
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
  // What the agent actually said. Without it, three "Finished its turn"
  // notifications from one session are indistinguishable — which is exactly
  // what grouping them under one header made obvious.
  const detail = record.detail && !record.delivery.suppressed
    ? truncateSessionTitle(record.detail, compact ? 68 : 140)
    : undefined;
  // Grouped or not, the row's first line is what the reader aims at to reach
  // the work. Grouping moved the session title into the header; it must not
  // also have taken the row's ability to navigate.
  const route = sessionRoute(record);
  return (
    <li
      className={cn(
        // Wraps rather than squeezing. Two 44px actions plus a kind badge plus
        // readable text do not fit one 390px line, and letting the text column
        // absorb the whole deficit truncated headings to a few characters. With
        // `flex-wrap` and a floor on the text column the action cluster drops to
        // its own right-aligned line on a phone and stays inline on a desktop
        // popover, with no breakpoint to keep in sync.
        "flex flex-wrap items-start gap-3 border-b border-[var(--color-border-default)] last:border-0",
        compact ? "gap-x-2 gap-y-1.5 p-2" : "p-3",
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
      <div className="min-w-[9rem] flex-1">
        <p className="flex items-center gap-1.5 text-sm">
          <span
            className="min-w-0 truncate"
            {...(grouped
              ? { "data-testid": "opencode-notification-action" }
              : sessionLabel
                ? { title: record.sessionTitle, "data-testid": "opencode-notification-session" }
                : {})}
          >
            {/* Plain text now. Opening the session is this row's main action,
                so it moved to a real button on the action line below rather
                than staying an underlined run of heading text — which was
                simultaneously the row's most important control and its least
                prominent one, at roughly a 13px tap target on a phone. */}
            {heading}
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
        {/* Rendered in both modes: a grouped row promotes `action` to its
            heading, so without this it would have no room left to say which
            of its siblings it is. */}
        {detail && (
          <p
            className="truncate text-xs italic text-[var(--color-text-muted)]"
            title={record.detail}
            data-testid="opencode-notification-detail"
          >
            {detail}
          </p>
        )}
        {/* Status rides the metadata line rather than the action cluster: it
            describes the session, like the project name already beside it, and
            it is not something to press. Keeping it here also leaves the
            cluster to the two real actions. */}
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="min-w-0 truncate text-[11px] text-[var(--color-text-muted)]">
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
                the Resolve button already carry their headline. Parking is the
                exception: it is the only escalation this row can report. */}
            {compact
              ? record.parkedAt
                ? " · parked"
                : ""
              : ` · ${deliverySummary(record)}${resolution ? ` · ${resolution}` : ""}`}
          </p>
          {/* Answers "should I open this now, or let it finish?" without
              leaving the popover for the Hub. Rendered in both the compact and
              full variants — the question is identical on the history page —
              but suppressed under a group header, which already says it once
              for the whole session. Status is a fact about the session, not
              about the record, so repeating it on every row is precisely the
              duplication grouping exists to remove; that is the same reason a
              grouped row drops the session title above. */}
          {record.sessionID && !grouped && <StatusPill status={status} />}
        </div>
      </div>
      {/* `ml-auto` keeps the cluster hard right on the line it wraps onto, so a
          phone reads it as one action group rather than as stray controls. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* Opening the session is this row's reason to exist, so it is a real
            button with a real target instead of the underlined heading text it
            used to be. Still a Link, never a button with a navigate() handler:
            middle-click, cmd-click and "copy link address" belong to the
            anchor, and a click handler silently takes all three away.

            `info` rather than `primary`: this app's primary token is green and
            is already spent on Resolve beside it. Two solid buttons in the same
            colour would make the reader decode which one navigates. */}
        {route && (
          <Link
            className={buttonClasses({
              variant: "info",
              size: "sm",
              className: cn("min-h-11 shrink-0 font-medium", compact ? "px-2.5 text-[11px]" : "px-3 text-xs"),
            })}
            to={route}
            onClick={onNavigate}
            aria-label={`Open session ${record.sessionTitle ?? record.title}`}
            data-testid="opencode-notification-link"
          >
            Open
          </Link>
        )}
        {/* A button rather than a checkbox: a 13px checkbox was a poor target
            for it — especially on a phone, where the whole popover is
            thumb-driven. `aria-pressed` carries the state a checkbox used to
            carry, and the action stays reversible per AGENTS.md decision 10:
            pressing a resolved row unresolves it. */}
        <Button
          size="sm"
          variant={active ? "primary" : "ghost"}
          aria-pressed={!active}
          className={cn(
            "min-h-11 shrink-0 gap-1.5 font-medium",
            compact ? "px-2 text-[11px]" : "px-3 text-xs",
            !active && "text-[var(--color-text-muted)]",
          )}
          onClick={() => onResolvedChange(record.id, active)}
          title={active ? "Mark this resolved" : "Mark this unresolved again"}
          data-testid="opencode-notification-resolved"
        >
          {active ? <Circle aria-hidden="true" size={13} /> : <Check aria-hidden="true" size={13} />}
          {active ? "Resolve" : "Resolved"}
        </Button>
      </div>
    </li>
  );
}
