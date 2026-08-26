import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "../ds/badge.js";
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
  compact = false,
}: {
  group: SessionGroup;
  expanded: boolean;
  onToggle: () => void;
  onResolvedChange: (id: string, resolved: boolean) => void;
  compact?: boolean;
}) {
  const bodyId = `opencode-notification-group-body-${group.key}`;
  const label = truncateSessionTitle(group.label, compact ? 38 : 64);

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
                <Badge key={chip.kind} variant={KIND_VARIANT[chip.kind]} data-testid={`opencode-notification-group-chip-${chip.kind}`}>
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
            rows used to repeat lives here once. */}
        {group.click && (
          <a
            className="shrink-0 pt-0.5 text-xs underline underline-offset-2"
            href={group.click}
            data-testid="opencode-notification-group-link"
          >
            Open
          </a>
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
            />
          ))}
        </ul>
      )}
    </li>
  );
}
