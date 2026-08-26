import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { Alert } from "../ds/alert.js";
import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { NotificationFilters } from "../components/notification-filters.js";
import { NotificationGroup } from "../components/notification-group.js";
import { NotificationRecordRow } from "../components/notification-record-row.js";
import type { NotificationHistoryState } from "../lib/api.js";
import { groupBySession } from "../lib/notificationGroups.js";
import { NOTIFICATION_STATE_PARAM, parseNotificationHistoryState } from "../lib/notificationView.js";
import { DIRECTORY_STORAGE_KEY, resolvePaletteDirectory } from "../lib/palette.js";
import { useNotificationCenter } from "../lib/useNotificationCenter.js";

const STATES: Array<{ value: NotificationHistoryState; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
];

/**
 * The full, filterable notification history. Delivery preferences moved to the
 * Settings page: this surface is only the record of what was sent and what the
 * user has manually resolved.
 */
export function NotificationsPage() {
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  // The Active/Resolved split lives in the URL, not component state: "show me
  // what still needs me" is the view worth bookmarking and sharing, and it was
  // previously unreachable except by clicking.
  const historyState = parseNotificationHistoryState(searchParams.get(NOTIFICATION_STATE_PARAM));
  const selectHistoryState = useCallback(
    (next: NotificationHistoryState) => {
      const params = new URLSearchParams(searchParams);
      // "all" is the absence of the parameter, so the canonical link to the
      // whole history stays the bare route.
      if (next === "all") params.delete(NOTIFICATION_STATE_PARAM);
      else params.set(NOTIFICATION_STATE_PARAM, next);
      // replace, not push: these pills are a filter, and stacking every one of
      // them on the history stack would make Back stop meaning "the page I came
      // from".
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const {
    activeCount,
    records,
    suppressedActive,
    view,
    setView,
    isGroupExpanded,
    toggleGroup,
    setAllGroupsCollapsed,
    loading,
    error: historyError,
    setResolved,
  } = useNotificationCenter();
  const location = useLocation();
  const directory = resolvePaletteDirectory(location.search, localStorage.getItem(DIRECTORY_STORAGE_KEY));
  const settingsPath = directory ? `/settings?${new URLSearchParams({ directory })}` : "/settings";

  // Filtered client-side: the centre already holds the newest page, so a
  // round trip per filter click would only add latency.
  const visible = useMemo(() => {
    if (historyState === "all") return records;
    const wantActive = historyState === "active";
    return records.filter((record) => (record.resolvedAt === undefined) === wantActive);
  }, [records, historyState]);

  const groups = useMemo(
    () => (view.groupBySession ? groupBySession(visible) : []),
    [visible, view.groupBySession],
  );

  // The badge above is the server's unwindowed total, but this list is the
  // newest page only. Unresolved records are retained forever and there is no
  // bulk clear, so the two diverge in normal use; name the gap rather than let
  // the badge silently contradict the rows.
  const hiddenActive = Math.max(
    0,
    activeCount - records.filter((record) => record.resolvedAt === undefined).length,
  );

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" data-testid="opencode-notifications">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          Notifications
          {activeCount > 0 && (
            <Badge variant="counter" data-testid="opencode-notifications-active-count">
              {activeCount}
            </Badge>
          )}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Everything OpenCode tried to send you. Delivery preferences live in{" "}
          <Link className="underline underline-offset-2" to={settingsPath} data-testid="opencode-notifications-preferences-link">
            Settings
          </Link>
          .
        </p>
      </header>
      {error && <Alert variant="danger">{error}</Alert>}

      <section className="rounded-lg border border-[var(--color-border-default)]" data-testid="opencode-notification-history">
        <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] p-3">
          <h2 className="mr-auto font-semibold">History</h2>
          {STATES.map((state) => (
            <Button
              key={state.value}
              size="sm"
              variant={historyState === state.value ? "secondary" : "ghost"}
              aria-pressed={historyState === state.value}
              onClick={() => selectHistoryState(state.value)}
              data-testid={`opencode-history-filter-${state.value}`}
            >
              {state.label}
            </Button>
          ))}
        </header>
        <div className="border-b border-[var(--color-border-default)] px-3 py-2">
          <NotificationFilters
            view={view}
            onChange={setView}
            suppressedActive={suppressedActive}
            onAllGroupsCollapsedChange={setAllGroupsCollapsed}
          />
        </div>
        {historyError && <Alert variant="danger">{historyError}</Alert>}
        {hiddenActive > 0 && (
          <p
            className="border-b border-[var(--color-border-default)] p-3 text-xs text-[var(--color-text-muted)]"
            data-testid="opencode-notification-history-outside-window"
          >
            Showing the newest {records.length} records.{" "}
            {hiddenActive === 1
              ? "1 older unresolved record is outside this page."
              : `${hiddenActive} older unresolved records are outside this page.`}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="p-3 text-sm text-[var(--color-text-muted)]" data-testid="opencode-history-empty">
            {loading ? "Loading history..." : "No notifications recorded yet."}
          </p>
        ) : view.groupBySession ? (
          <ul>
            {groups.map((group) => (
              <NotificationGroup
                key={group.key}
                group={group}
                expanded={isGroupExpanded(group.key)}
                onToggle={() => toggleGroup(group.key)}
                onResolvedChange={(id, resolved) => void setResolved(id, resolved).catch((e: Error) => setError(e.message))}
              />
            ))}
          </ul>
        ) : (
          <ul>
            {visible.map((record) => (
              <NotificationRecordRow
                key={record.id}
                record={record}
                onResolvedChange={(id, resolved) => void setResolved(id, resolved).catch((e: Error) => setError(e.message))}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
