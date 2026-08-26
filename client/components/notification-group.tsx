import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { cn } from "../ds/utils.js";
import type { SessionGroup } from "../lib/notificationGroups.js";
import { KIND_VARIANT, NotificationRecordRow, truncateSessionTitle } from "./notification-record-row.js";

/**
 * One session's notifications behind a collapsible header.
 *
 * Groups start folded, so the header has to carry enough to triage without
 * opening: the session it belongs to, how many rows are inside, and the chip
 * strip naming which kinds are waiting. Without that last part a folded group
 * would hide an unanswered permission behind a number, which is the failure
 * this whole surface exists to prevent.
 *
 * The count is the rows this group renders, not the session's lifetime total.
 * The section around it already declares how much of the log is outside the
 * window; a header claiming an unwindowed total it cannot see would be a
 * confident falsehood.
 */
export function NotificationGroup({
  group,
  expanded,
  onToggle,
  onResolvedChange,
  onResolveMany,
  onError,
  compact = false,
  onNavigate,
}: {
  group: SessionGroup;
  expanded: boolean;
  onToggle: () => void;
  onResolvedChange: (id: string, resolved: boolean) => void;
  /** Resolve the active records belonging to this one session group. */
  onResolveMany?: (ids: string[]) => Promise<void>;
  onError?: (error: Error) => void;
  compact?: boolean;
  /** Fired when the header or a row navigates, so an overlay can dismiss. */
  onNavigate?: () => void;
}) {
  const [resolvePending, setResolvePending] = useState(false);
  const bodyId = `opencode-notification-group-body-${group.key}`;
  const label = truncateSessionTitle(group.label, compact ? 38 : 64);
  const activeIDs = group.records.filter((record) => record.resolvedAt === undefined).map((record) => record.id);

  const resolveSession = async () => {
    if (!onResolveMany || activeIDs.length === 0) return;
    const noun = activeIDs.length === 1 ? "notification" : "notifications";
    if (!window.confirm(`Resolve all ${activeIDs.length} active ${noun} for ${group.label}? You can reopen each one later.`)) return;
    setResolvePending(true);
    try {
      await onResolveMany(activeIDs);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setResolvePending(false);
    }
  };

  return (
    <li
      className="border-b border-[var(--color-border-default)] last:border-0"
      data-testid="opencode-notification-group"
      data-group-key={group.key}
      data-expanded={expanded ? "true" : "false"}
    >
      <div className={cn("flex items-start gap-2", compact ? "px-2 py-1.5" : "px-3 py-2")}>
        <button
          type="button"
          aria-controls={bodyId}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 rounded text-left hover:bg-[var(--color-background-surface-neutral-muted)]"
          onClick={onToggle}
          data-testid="opencode-notification-group-toggle"
        >
          {expanded ? (
            <ChevronDown aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
          ) : (
            <ChevronRight aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-medium"
              title={group.title ?? group.label}
              data-testid="opencode-notification-group-label"
            >
              {label}
            </span>
            {/* The only thing a folded group says about its contents. */}
            <span
              className="mt-0.5 flex flex-wrap items-center gap-1"
              data-testid="opencode-notification-group-chips"
            >
              {group.chips.map((chip) => (
                <Badge
                  key={chip.kind}
                  variant={KIND_VARIANT[chip.kind]}
                  // Group headers can carry six kinds. The DS badge is right
                  // for a row's primary status, but at that density it made a
                  // folded mobile group taller than the information it held.
                  // This is deliberately ~40% smaller in text and padding,
                  // scoped only to the aggregate chip strip — individual row
                  // statuses stay at the normal touch-readable size.
                  className="px-1.5 py-px text-[8px] leading-none"
                  data-testid={`opencode-notification-group-chip-${chip.kind}`}
                >
                  {chip.kind}
                  {chip.count > 1 && <span className="ml-1 tabular-nums">{chip.count}</span>}
                </Badge>
              ))}
            </span>
          </span>
          <span
            className="shrink-0 pt-0.5 text-xs tabular-nums text-[var(--color-text-muted)]"
            data-testid="opencode-notification-group-count"
          >
            {group.records.length}
          </span>
        </button>
        {/* Every record in a group points at the same session, so the link the
            rows used to repeat lives here once — and a folded group stays one
            click from the work, without being expanded first. It sits outside
            the disclosure button because a link cannot nest inside one. */}
        {group.route && (
          <Link
            className="shrink-0 pt-0.5 text-xs underline underline-offset-2"
            to={group.route}
            onClick={onNavigate}
            aria-label={`Open session ${group.label}`}
            data-testid="opencode-notification-group-link"
          >
            Open
          </Link>
        )}
        {onResolveMany && activeIDs.length > 0 && (
          <Button
            size="sm"
            variant="primary"
            className={cn("shrink-0", compact ? "h-7 px-2 text-[11px]" : undefined)}
            disabled={resolvePending}
            onClick={() => void resolveSession()}
            data-testid="opencode-notification-group-resolve"
          >
            {resolvePending ? "Resolving..." : `Resolve all (${activeIDs.length})`}
          </Button>
        )}
      </div>
      {expanded && (
        <ul
          className="border-t border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)]"
          id={bodyId}
          data-testid="opencode-notification-group-records"
        >
          {group.records.map((record) => (
            <NotificationRecordRow
              key={record.id}
              record={record}
              onResolvedChange={onResolvedChange}
              compact={compact}
              grouped
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
