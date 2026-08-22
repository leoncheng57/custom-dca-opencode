import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import type { NotificationRecord } from "../lib/api.js";
import { useNotificationCenter } from "../lib/useNotificationCenter.js";
import { NotificationRecordRow } from "./notification-record-row.js";

/** Highest number the decorative pill prints literally; above this it reads "99+". */
const BADGE_CAP = 99;

/**
 * One scrollable column of the popover. Active and Resolved stay in their own
 * bounded, independently scrolling lists so a long backlog on one side never
 * hides the other — and never grows the nav.
 */
function RecordColumn({
  title,
  records,
  emptyLabel,
  testId,
  onResolvedChange,
  footer,
}: {
  title: string;
  records: NotificationRecord[];
  emptyLabel: string;
  testId: string;
  onResolvedChange: (id: string, resolved: boolean) => void;
  footer?: ReactNode;
}) {
  const headingId = `${testId}-heading`;
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-[var(--color-border-default)]"
      aria-labelledby={headingId}
    >
      <h3
        className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
        id={headingId}
      >
        {title}
        <span className="tabular-nums" data-testid={`${testId}-count`}>
          {records.length}
        </span>
      </h3>
      {records.length === 0 ? (
        <p className="p-3 text-xs text-[var(--color-text-muted)]" data-testid={`${testId}-empty`}>
          {emptyLabel}
        </p>
      ) : (
        <ul className="max-h-56 min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid={testId}>
          {records.map((record) => (
            <NotificationRecordRow key={record.id} record={record} onResolvedChange={onResolvedChange} compact />
          ))}
        </ul>
      )}
      {footer}
    </section>
  );
}

/** Plural-safe copy for the count of unresolved records outside the window. */
function outsideWindowNotice(hidden: number): string {
  return hidden === 1
    ? "1 older unresolved record is outside this view. Open the full notification history below to see it."
    : `${hidden} older unresolved records are outside this view. Open the full notification history below to see them.`;
}

/**
 * Nav notification centre. The trigger is a button, never a link: opening the
 * centre must not cost the user their place in a conversation. The full,
 * filterable history still lives at /settings/notifications.
 */
export function NotificationPopover({ scopedPath }: { scopedPath: (path: string) => string }) {
  const { activeCount, records, loading, error, setResolved } = useNotificationCenter();
  const [open, setOpen] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // Focus the panel itself rather than its first control: the first control is
  // a Resolved checkbox, and landing on it invites an accidental toggle.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const { active, resolved } = useMemo(
    () => ({
      active: records.filter((record) => record.resolvedAt === undefined),
      resolved: records.filter((record) => record.resolvedAt !== undefined),
    }),
    [records],
  );

  const onResolvedChange = (id: string, next: boolean) => {
    void setResolved(id, next).catch((e: Error) => setMutationError(e.message));
  };

  // The centre loads only the newest page of history, while activeCount is the
  // server's unwindowed total. Manual-only resolution (AGENTS.md decision 10)
  // retains every unresolved record, so exceeding the window is the steady
  // state, not an edge case. The column header must keep counting the rows it
  // actually renders; the gap is named here instead of being papered over.
  const hiddenActive = Math.max(0, activeCount - active.length);

  // The label carries the exact count and is the real contract; the pill is
  // decorative and caps, because resolution is manual-only (AGENTS.md decision
  // 10) so a real backlog reaches three digits and would swallow the bell.
  const label = activeCount > 0 ? `Notifications, ${activeCount} unresolved` : "Notifications";
  const badgeCount = activeCount > BADGE_CAP ? `${BADGE_CAP}+` : String(activeCount);

  return (
    <div
      className="relative"
      ref={wrapperRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        close();
      }}
    >
      <Button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="relative size-8 shrink-0 p-0 pointer-coarse:size-11"
        onClick={() => (open ? close() : setOpen(true))}
        ref={triggerRef}
        size="sm"
        title={label}
        type="button"
        variant="ghost"
        data-testid="opencode-nav-notifications"
      >
        <Bell aria-hidden="true" size={16} />
        {activeCount > 0 && (
          // The count is already in the button label so screen readers
          // announce it; the pill itself is decorative and capped.
          <Badge
            variant="counter"
            className="absolute -right-1.5 -top-1 h-4 min-w-4 px-1 text-[10px] leading-none"
            aria-hidden="true"
            data-testid="opencode-nav-notifications-badge"
          >
            {badgeCount}
          </Badge>
        )}
      </Button>
      {open && (
        <div
          aria-label="Notifications"
          className="fixed inset-x-2 top-11 z-50 flex max-h-[min(28rem,calc(100dvh-4rem))] flex-col gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-2 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[38rem]"
          id={panelId}
          ref={panelRef}
          role="dialog"
          tabIndex={-1}
          data-testid="opencode-notification-popover"
        >
          {error && <Alert variant="danger">{error}</Alert>}
          {mutationError && <Alert variant="danger">{mutationError}</Alert>}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto sm:flex-row sm:overflow-visible">
            <RecordColumn
              title="Active"
              records={active}
              emptyLabel={
                loading
                  ? "Loading..."
                  : hiddenActive > 0
                    // "Nothing unresolved" would be a confident falsehood when
                    // the server says otherwise.
                    ? "No unresolved records in this view."
                    : "Nothing unresolved."
              }
              testId="opencode-notification-popover-active"
              onResolvedChange={onResolvedChange}
              footer={
                hiddenActive > 0 ? (
                  <p
                    className="shrink-0 border-t border-[var(--color-border-default)] p-2 text-[11px] text-[var(--color-text-muted)]"
                    data-testid="opencode-notification-popover-active-outside-window"
                  >
                    {outsideWindowNotice(hiddenActive)}
                  </p>
                ) : undefined
              }
            />
            <RecordColumn
              title="Resolved"
              records={resolved}
              emptyLabel={loading ? "Loading..." : "Nothing resolved yet."}
              testId="opencode-notification-popover-resolved"
              onResolvedChange={onResolvedChange}
            />
          </div>
          <Link
            className="shrink-0 rounded px-2 py-1.5 text-xs underline underline-offset-2 hover:bg-[var(--color-background-surface-neutral-muted)]"
            onClick={() => close(false)}
            to={scopedPath("/settings/notifications")}
            data-testid="opencode-notification-popover-history"
          >
            Open full notification history
          </Link>
        </div>
      )}
    </div>
  );
}
