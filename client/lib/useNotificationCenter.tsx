import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { api, type NotificationRecord, type SuppressedActiveCounts } from "./api.js";
import { DIRECTORY_STORAGE_KEY, resolvePaletteDirectory } from "./palette.js";
import { syncAppBadge } from "./appBadge.js";
import {
  runStateFor,
  runStateMap,
  statusCandidates,
  type SessionRunState,
} from "./sessionRunState.js";
import {
  DEFAULT_NOTIFICATION_VIEW,
  loadNotificationView,
  saveNotificationView,
  type NotificationViewPreferences,
} from "./notificationView.js";
import { sessionTag, closeNotificationsForTag } from "./closeStaleNotifications.js";

const NO_SUPPRESSED_ACTIVE: SuppressedActiveCounts = { "auto-permissions": 0, subagent: 0, "preference-off": 0 };

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
   * Whether the session behind a record is working right now. Held here for
   * the same reason `isGroupExpanded` is: the popover and the history page
   * render the same rows, and two independently fetched answers to "is it
   * still running?" could disagree while both are mounted.
   *
   * Always safe to call — an unknown session, a failed fetch and a session the
   * bounded fan-out never covered all answer `unknown`.
   */
  sessionStatus: (sessionID?: string) => SessionRunState;
  /**
   * Sets the persisted default and drops every per-group override, so
   * "Expand all" cannot leave a group folded behind its own toggle.
   */
  setAllGroupsCollapsed: (collapsed: boolean) => void;
  loading: boolean;
  error: string;
  refresh: () => void;
  setResolved: (id: string, resolved: boolean) => Promise<void>;
  /** Resolve only rows the calling surface rendered; each stays reversible. */
  resolveMany: (ids: string[]) => Promise<void>;
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

/**
 * How often the running/idle join refreshes.
 *
 * 60s, matching the Hub's RECENTS_POLL_MS rather than the 10s session poll,
 * because this rides the same cross-project fan-out and AGENTS.md decision 12
 * put recents on a slower timer precisely so a capped fan-out is not paid for
 * at conversation cadence.
 */
const STATUS_POLL_MS = 60_000;

/**
 * Ask only about the sessions we named.
 *
 * `/api/recent-sessions` returns the newest `limit` sessions in the pool PLUS
 * every session matched by an explicit `session=` lookup. This join wants only
 * the second half — the newest sessions across a project are irrelevant unless
 * a notification points at them — so the limit is zero and the lookup ids do
 * all the selecting.
 */
const STATUS_RECENTS_LIMIT = 0;

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
  const { hideAutoApproved, hideSubagent, hidePreferenceOff } = view;

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
        hidePreferenceOff,
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
  }, [directory, hideAutoApproved, hideSubagent, hidePreferenceOff]);

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

  // Running/idle state for the sessions the current window has records for.
  // Absent ids are `unknown`, so an empty map — first paint, a failed fetch, a
  // session past the fan-out caps — degrades to claiming nothing.
  const [runStates, setRunStates] = useState<ReadonlyMap<string, SessionRunState>>(() => new Map());

  const candidates = useMemo(() => statusCandidates(records), [records]);
  // Serialized so the effect re-runs when the candidate SET changes rather than
  // on every history refresh that returns the same sessions. Same technique the
  // Hub uses for its own recents scope, for the same reason.
  const statusDirectoryKey = candidates.directories.join("\n");
  const statusSessionKey = candidates.sessionIDs.join("\n");

  useEffect(() => {
    const directories = statusDirectoryKey ? statusDirectoryKey.split("\n") : [];
    const sessionIDs = statusSessionKey ? statusSessionKey.split("\n") : [];
    if (directories.length === 0 || sessionIDs.length === 0) {
      setRunStates(new Map());
      return;
    }
    let cancelled = false;
    const load = () => {
      api
        .recentSessions(directories, sessionIDs, STATUS_RECENTS_LIMIT)
        .then((result) => {
          if (!cancelled) setRunStates(runStateMap(result.sessions));
        })
        // Fail to `unknown`, never to `idle`. A status join that cannot reach
        // the server knows nothing, and saying nothing is the honest failure —
        // an "idle" pill on a session that is in fact mid-turn is the one
        // outcome worth engineering against.
        .catch(() => {
          if (!cancelled) setRunStates(new Map());
        });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      load();
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [statusDirectoryKey, statusSessionKey]);

  const sessionStatus = useCallback(
    (sessionID?: string) => runStateFor(runStates, sessionID),
    [runStates],
  );

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
        // Close the OS notification card when resolving (not when reopening).
        // Fire-and-forget: never let this best-effort cleanup break the resolve.
        if (resolved && target) {
          void closeNotificationsForTag(sessionTag(target));
        }
      } finally {
        // Confirm the optimistic state, or roll it back to the server value if
        // the mutation failed.
        await refresh();
      }
    },
    [directory, records, refresh],
  );

  const resolveMany = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        const result = await api.resolveNotifications(ids, directory);
        // The POST already carries the authoritative badge snapshot. Apply it
        // immediately so a later history refresh failure cannot leave the
        // installed-app badge stale after a successful mutation.
        void syncAppBadge(result.appBadgeCount, navigator, result.appBadgeRevision);
        
        // Close OS notification cards for all resolved records. Find the
        // resolved records in the current state, compute their distinct tags,
        // and close each tag once (multiple records can share one session tag).
        const resolvedRecords = records.filter((record) => ids.includes(record.id));
        const distinctTags = new Set(resolvedRecords.map(sessionTag));
        for (const tag of distinctTags) {
          void closeNotificationsForTag(tag);
        }
      } finally {
        // Confirm the server's bounded selection rather than assuming every id
        // still existed or stayed active between confirmation and the POST.
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
      sessionStatus,
      loading,
      error,
      refresh: () => void refresh(),
      setResolved,
      resolveMany,
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
      sessionStatus,
      loading,
      error,
      refresh,
      setResolved,
      resolveMany,
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
      // No provider means no fan-out has run, so there is nothing to claim.
      sessionStatus: () => "unknown" as SessionRunState,
      loading: false,
      error: "",
      refresh: () => {},
      setResolved: async () => {},
      resolveMany: async () => {},
    }
  );
}
