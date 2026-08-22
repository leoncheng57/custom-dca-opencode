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
 */
export function NotificationFilters({
  view,
  onChange,
  suppressedActive,
  className,
}: {
  view: NotificationViewPreferences;
  onChange: (patch: Partial<NotificationViewPreferences>) => void;
  suppressedActive: SuppressedActiveCounts;
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
    </div>
  );
}
