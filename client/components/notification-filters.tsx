import { Button } from "../ds/button.js";
import { cn } from "../ds/utils.js";
import type { SuppressedActiveCounts } from "../lib/api.js";
import type { NotificationViewPreferences } from "../lib/notificationView.js";

/**
 * The two noise filters, shared by the nav popover and the full history page
 * so a box ticked in one is ticked in the other.
 *
 * Both default to hiding, because both categories are records the server
 * deliberately never delivered a ping for: an auto-approved permission was
 * preapproved, and a sub-agent's lifecycle belongs to its parent. They are
 * checkboxes rather than a hard-coded exclusion so "why was I never asked?"
 * and "did my delegated child ever finish?" stay answerable — the records are
 * always written, only their visibility is a preference.
 *
 * Each label carries the number of unresolved rows it is responsible for
 * hiding, so the filter states its own cost instead of quietly swallowing work.
 *
 * Grouping sits alongside them but is a different kind of control: it hides no
 * record and is never sent to the server, so it carries no count. Its
 * expand/collapse companion writes the persisted default rather than a
 * transient view state, which is what lets a device settle on dense or open
 * once instead of every visit.
 */
export function NotificationFilters({
  view,
  onChange,
  suppressedActive,
  onAllGroupsCollapsedChange,
  className,
}: {
  view: NotificationViewPreferences;
  onChange: (patch: Partial<NotificationViewPreferences>) => void;
  suppressedActive: SuppressedActiveCounts;
  onAllGroupsCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}) {
  const options = [
    {
      key: "hideAutoApproved" as const,
      label: "Hide auto-approved",
      hidden: suppressedActive["auto-permissions"],
      testId: "opencode-notification-filter-auto-approved",
      title:
        "Permission requests recorded while auto permissions was enabled. They were approved without asking, so there is nothing to decide.",
    },
    {
      key: "hideSubagent" as const,
      label: "Hide sub-agent",
      hidden: suppressedActive.subagent,
      testId: "opencode-notification-filter-subagent",
      title: "Notifications raised by delegated child sessions rather than a session you started.",
    },
    {
      key: "hidePreferenceOff" as const,
      label: "Hide switched-off kinds",
      hidden: suppressedActive["preference-off"],
      testId: "opencode-notification-filter-preference-off",
      title:
        "Events whose kind is turned off in every delivery channel. They are still recorded so you can see what happened, but nothing was ever sent.",
    },
  ];

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}
      data-testid="opencode-notification-filters"
    >
      {options.map((option) => (
        <label
          key={option.key}
          className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-text-muted)]"
          title={option.title}
        >
          <input
            type="checkbox"
            checked={view[option.key]}
            onChange={(event) => onChange({ [option.key]: event.target.checked })}
            data-testid={option.testId}
          />
          <span>{option.label}</span>
          {option.hidden > 0 && (
            <span className="tabular-nums" data-testid={`${option.testId}-count`}>
              ({option.hidden})
            </span>
          )}
        </label>
      ))}
      <label
        className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-text-muted)]"
        title="Collect each session's notifications under one collapsible header instead of repeating its title on every row."
      >
        <input
          type="checkbox"
          checked={view.groupBySession}
          onChange={(event) => onChange({ groupBySession: event.target.checked })}
          data-testid="opencode-notification-filter-group-session"
        />
        <span>Group by session</span>
      </label>
      {view.groupBySession && onAllGroupsCollapsedChange && (
        <Button
          size="sm"
          variant="ghost"
          className="h-auto px-1.5 py-0.5 text-xs"
          onClick={() => onAllGroupsCollapsedChange(!view.groupsCollapsed)}
          data-testid="opencode-notification-groups-expand-all"
        >
          {view.groupsCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      )}
    </div>
  );
}
