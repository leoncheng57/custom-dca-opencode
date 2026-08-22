import { Badge, type BadgeVariant } from "../ds/badge.js";
import { cn } from "../ds/utils.js";
import type { NotificationRecord, NotifyEvent } from "../lib/api.js";
import { formatClockTime, formatRelative } from "../lib/derive.js";

export const KIND_VARIANT: Record<NotifyEvent, BadgeVariant> = {
  idle: "neutral",
  error: "danger",
  abort: "warning",
  permission: "info",
  question: "info",
  parked: "warning",
  pty: "warning",
};

export function projectName(directory?: string): string {
  return directory?.split("/").filter(Boolean).at(-1) ?? "unknown project";
}

/** Plain-language delivery summary. Never claims a browser actually rendered it. */
export function deliverySummary(record: NotificationRecord): string {
  if (record.delivery.suppressed === "auto-permissions") return "suppressed by auto permissions";
  const parts = [
    record.delivery.ntfy === "sent"
      ? "ntfy sent"
      : record.delivery.ntfy === "failed"
        ? `ntfy failed: ${record.delivery.ntfyError ?? "unknown error"}`
        : "ntfy off",
    record.delivery.desktop === "allowed" ? "desktop allowed" : "desktop off",
  ];
  return parts.join(" · ");
}

export function resolutionSummary(record: NotificationRecord): string {
  if (record.resolvedAt === undefined) return record.parkedAt ? "unresolved · parked" : "unresolved";
  return `${record.resolvedBy ?? "resolved"}`;
}

/**
 * One history row, shared by the full history page and the nav popover so both
 * surfaces stay consistent. `compact` folds the fixed timestamp column into the
 * metadata line, which is what makes the row survive a ~360px popover column.
 */
export function NotificationRecordRow({
  record,
  onResolvedChange,
  compact = false,
}: {
  record: NotificationRecord;
  onResolvedChange: (id: string, resolved: boolean) => void;
  compact?: boolean;
}) {
  const timestamp = new Date(record.at).toISOString();
  const active = record.resolvedAt === undefined;
  const resolution = resolutionSummary(record);
  const relative = formatRelative(timestamp) || formatClockTime(timestamp);
  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-[var(--color-border-default)] last:border-0",
        compact ? "gap-2 p-2" : "p-3",
      )}
      data-testid="opencode-notification-record"
      data-kind={record.kind}
      data-active={active ? "true" : "false"}
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
        <p className="truncate text-sm">
          {record.click ? (
            <a className="underline underline-offset-2" href={record.click} data-testid="opencode-notification-link">
              {record.title}
            </a>
          ) : (
            record.title
          )}
        </p>
        <p className="truncate text-xs text-[var(--color-text-muted)]">{record.body}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
          {compact && (
            <time dateTime={timestamp} title={new Date(record.at).toLocaleString()} className="tabular-nums">
              {relative}
            </time>
          )}
          {compact ? " · " : ""}
          {projectName(record.directory)}
          {record.sessionID ? ` · ${record.sessionID}` : ""} · {deliverySummary(record)}
          {resolution ? ` · ${resolution}` : ""}
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
