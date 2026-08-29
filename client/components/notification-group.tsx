import { useState } from "react";
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, buttonClasses } from "../ds/button.js";
import { cn } from "../ds/utils.js";
import { NO_SESSION_KEY, type SessionGroup } from "../lib/notificationGroups.js";
import { useNotificationCenter } from "../lib/useNotificationCenter.js";
import { NotificationRecordRow, truncateSessionTitle } from "./notification-record-row.js";
import { StatusPill } from "./status-pill.js";

/**
 * One session's notifications behind a collapsible header.
 *
 * Groups start folded, so the header has to carry enough to triage without
 * opening: the session it belongs to, whether it is still working, how many
 * rows are inside, and — critically — whether any of them is waiting on a
 * human. Without that last part a folded group would hide an unanswered
 * permission behind a number, which is the failure this whole surface exists
 * to prevent.
 *
 * That guarantee used to be carried by an aggregate chip strip naming every
 * kind present. Issue #288 removed the strip: six kinds' worth of chips spent a
 * whole line restating things a folded reader could not act on, and only one
 * bit of it ever changed a decision. What replaced it is that single bit — a
 * "needs you" marker shown only when an unresolved permission, question or
 * parked escalation is inside. The safety property is unchanged; the line is
 * gone. AGENTS.md decision 23 records the swap.
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
  const { sessionStatus } = useNotificationCenter();
  // A group is exactly one session, so the header can carry its status once
  // instead of every row repeating it. The no-session bucket has nothing to
  // report on and gets no pill at all.
  const status = group.key === NO_SESSION_KEY ? undefined : sessionStatus(group.key);
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
            {/* What a folded group says about its contents, reduced to the one
                thing a folded reader can act on. Rendered only when something
                unresolved is actually waiting, so its presence is the signal —
                an indicator that is always there says nothing. */}
            {(group.blocking || status) && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                {group.blocking && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-background-surface-warning-muted)] px-1.5 py-px text-[10px] font-semibold text-[var(--color-text-warning)]"
                    data-testid="opencode-notification-group-blocking"
                  >
                    <span aria-hidden="true">●</span>
                    needs you
                  </span>
                )}
                {status && <StatusPill status={status} className="px-1.5 text-[10px]" />}
              </span>
            )}
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
            className={buttonClasses({
              variant: "info",
              size: "sm",
              // 40px in the popover rather than the row's 44px: this is the
              // design system's own coarse-pointer floor, and spending the
              // extra 4px on every folded header is a cost the whole list
              // pays for a secondary affordance.
              className: cn("shrink-0 p-0", compact ? "size-10" : "size-11"),
            })}
            to={group.route}
            onClick={onNavigate}
            aria-label={`Open session ${group.label}`}
            title={`Open session ${group.label}`}
            data-testid="opencode-notification-group-link"
          >
            <ExternalLink aria-hidden="true" size={15} />
          </Link>
        )}
        {onResolveMany && activeIDs.length > 0 && (
          <Button
            size="sm"
            variant="primary"
            aria-label={`Resolve all ${activeIDs.length} for ${group.label}`}
            className={cn(
              // Fixed width, not content width. This is the only control on the
              // surface whose label embeds a number, so it was also the only one
              // that changed size as the number did — a group resolving from 9
              // to 10 visibly shifted the header, and two stacked groups with
              // different counts never lined up. `w-16` holds four tabular
              // digits plus the icon, which covers every count the 1000-row
              // window can produce. See AGENTS.md decision 23 for the window.
              "w-16 shrink-0 gap-1 px-0 tabular-nums",
              compact ? "h-10 text-[11px]" : "h-11 text-xs",
            )}
            disabled={resolvePending}
            onClick={() => void resolveSession()}
            title={`Resolve all ${activeIDs.length} active for ${group.label}`}
            data-testid="opencode-notification-group-resolve"
          >
            {resolvePending ? (
              <Loader2 aria-hidden="true" size={14} className="animate-spin" />
            ) : (
              <>
                <Check aria-hidden="true" size={14} className="shrink-0" />
                {activeIDs.length}
              </>
            )}
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
