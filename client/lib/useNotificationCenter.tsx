import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { api, type NotificationRecord, type SuppressedActiveCounts } from "./api.js";
import { DIRECTORY_STORAGE_KEY, resolvePaletteDirectory } from "./palette.js";
import { syncAppBadge } from "./appBadge.js";
import {
  DEFAULT_NOTIFICATION_VIEW,
  loadNotificationView,
  saveNotificationView,
  type NotificationViewPreferences,
} from "./notificationView.js";

const NO_SUPPRESSED_ACTIVE: SuppressedActiveCounts = { "auto-permissions": 0, subagent: 0 };

interface NotificationCenter {
  activeCount: number;
  records: NotificationRecord[];
  /** Unresolved rows each filter is hiding, reported whether or not it is on. */
  suppressedActive: SuppressedActiveCounts;
  view: NotificationViewPreferences;
  setView: (patch: Partial<NotificationViewPreferences>) => void;
  /**
   * Whether one session group is open, combining the persisted default with
   * this visit's toggles. Held here rather than in either surface so the
   * popover and the history page agree while both are mounted.
   */
  isGroupExpanded: (key: string) => boolean;
  toggleGroup: (key: string) => void;
  /**
   * Sets the persisted default and drops every per-group override, so
   * "Expand all" cannot leave a group folded behind its own toggle.
   */
  setAllGroupsCollapsed: (collapsed: boolean) => void;
  loading: boolean;
  error: string;
  refresh: () => void;
  setResolved: (id: string, resolved: boolean) => Promise<void>;
}

const NotificationCenterContext = createContext<NotificationCenter | null>(null);

/**
 * SSE types that can change the active set. The stream is only a nudge — the
 * server owns the count, so these trigger a refetch rather than a local
 * mutation. `permission.asked` is already filtered upstream when
 * auto-permissions is on, which is correct: those never become active.
 *
 * Consumed by useNotifyWatcher, which owns the single app-level EventSource.
 */
export const ACTIVE_SET_EVENTS = new Set([
  "notification.recorded",
]);

/**
 * Rows fetched per refresh, capped server-side by MAX_PAGE.
 *
 * Grouping counts the rows it renders, so a narrow window makes every group
 * header understate a busy session. Retention still caps resolved records at
 * 500, so this asks for the whole retained log rather than a page of it.
 */
const HISTORY_LIMIT = 1000;

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const directory = resolvePaletteDirectory(location.search, localStorage.getItem(DIRECTORY_STORAGE_KEY));
  const [records, setRecords] = useState<NotificationRecord[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [suppressedActive, setSuppressedActive] = useState<SuppressedActiveCounts>(NO_SUPPRESSED_ACTIVE);
  const [view, setViewState] = useState<NotificationViewPreferences>(loadNotificationView);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Guards against a slow early response overwriting a newer one.
  const generation = useRef(0);
  const { hideAutoApproved, hideSubagent } = view;

  const setView = useCallback((patch: Partial<NotificationViewPreferences>) => {
    setViewState((current) => saveNotificationView({ ...current, ...patch }));
  }, []);

  // Session ids that deviate from the persisted default. Deliberately in
  // memory: ids are unbounded and outlive their sessions, so persisting them
  // would grow without limit and accumulate ids of deleted work.
  const [groupOverrides, setGroupOverrides] = useState<ReadonlySet<string>>(() => new Set());
  const { groupsCollapsed } = view;

  const isGroupExpanded = useCallback(
    (key: string) => (groupOverrides.has(key) ? groupsCollapsed : !groupsCollapsed),
    [groupOverrides, groupsCollapsed],
  );

  const toggleGroup = useCallback((key: string) => {
    setGroupOverrides((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const setAllGroupsCollapsed = useCallback(
    (collapsed: boolean) => {
      setGroupOverrides(new Set());
      setView({ groupsCollapsed: collapsed });
    },
    [setView],
  );

  // The filters are applied server-side so the badge and the rows cannot
  // disagree; changing one therefore has to refetch rather than filter locally.
  const refresh = useCallback(() => {
    const request = ++generation.current;
    return api
      .notificationHistory({
        limit: HISTORY_LIMIT,
        ...(directory ? { directory } : {}),
        hideAutoApproved,
        hideSubagent,
      })
      .then((result) => {
        if (request !== generation.current) return;
        setRecords(result.records);
        setActiveCount(result.activeCount);
        setSuppressedActive(result.suppressedActive ?? NO_SUPPRESSED_ACTIVE);
        void syncAppBadge(result.appBadgeCount, navigator, result.appBadgeRevision);
        setError("");
      })
      .catch((e: Error) => {
        if (request !== generation.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
  }, [directory, hideAutoApproved, hideSubagent]);

  // Live updates arrive via useNotifyWatcher, which already holds the one
  // app-level EventSource; opening a second stream here would double every
  // tab's upstream fan-out for no benefit.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const refreshPage = () => void refresh();
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("pageshow", refreshPage);
    return () => {
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("pageshow", refreshPage);
    };
  }, [refresh]);

  const setResolved = useCallback(
    async (id: string, resolved: boolean) => {
      const target = records.find((record) => record.id === id);
      if (target && (target.resolvedAt !== undefined) !== resolved) {
        setRecords((current) => current.map((record) => {
          if (record.id !== id) return record;
          if (resolved) return { ...record, resolvedAt: Date.now(), resolvedBy: "checked" };
          const { resolvedAt: _resolvedAt, resolvedBy: _resolvedBy, ...unresolved } = record;
          return unresolved;
        }));
        if (!directory || target.directory === directory) {
          setActiveCount((count) => Math.max(0, count + (resolved ? -1 : 1)));
        }
      }
      try {
        await api.setNotificationResolved(id, resolved);
      } finally {
        // Confirm the optimistic state, or roll it back to the server value if
        // the mutation failed.
        await refresh();
      }
    },
    [directory, records, refresh],
  );

  const value = useMemo(
    () => ({
      activeCount,
      records,
      suppressedActive,
      view,
      setView,
      isGroupExpanded,
      toggleGroup,
      setAllGroupsCollapsed,
      loading,
      error,
      refresh: () => void refresh(),
      setResolved,
    }),
    [
      activeCount,
      records,
      suppressedActive,
      view,
      setView,
      isGroupExpanded,
      toggleGroup,
      setAllGroupsCollapsed,
      loading,
      error,
      refresh,
      setResolved,
    ],
  );

  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
}

/**
 * Returns an inert centre when no provider is mounted so isolated page tests
 * can render without the shell.
 */
export function useNotificationCenter(): NotificationCenter {
  return (
    useContext(NotificationCenterContext) ?? {
      activeCount: 0,
      records: [],
      suppressedActive: NO_SUPPRESSED_ACTIVE,
      view: DEFAULT_NOTIFICATION_VIEW,
      setView: () => {},
      isGroupExpanded: () => !DEFAULT_NOTIFICATION_VIEW.groupsCollapsed,
      toggleGroup: () => {},
      setAllGroupsCollapsed: () => {},
      loading: false,
      error: "",
      refresh: () => {},
      setResolved: async () => {},
    }
  );
}
