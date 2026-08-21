import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { api, type NotificationRecord } from "./api.js";
import { DIRECTORY_STORAGE_KEY, resolvePaletteDirectory } from "./palette.js";

interface NotificationCenter {
  activeCount: number;
  records: NotificationRecord[];
  loading: boolean;
  error: string;
  refresh: () => void;
  dismiss: (id: string) => Promise<void>;
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
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
  "question.rejected",
  "notification.parked",
]);

const HISTORY_LIMIT = 100;

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const directory = resolvePaletteDirectory(location.search, localStorage.getItem(DIRECTORY_STORAGE_KEY));
  const [records, setRecords] = useState<NotificationRecord[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Guards against a slow early response overwriting a newer one.
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const request = ++generation.current;
    return api
      .notificationHistory({ limit: HISTORY_LIMIT, ...(directory ? { directory } : {}) })
      .then((result) => {
        if (request !== generation.current) return;
        setRecords(result.records);
        setActiveCount(result.activeCount);
        setError("");
      })
      .catch((e: Error) => {
        if (request !== generation.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
  }, [directory]);

  // Live updates arrive via useNotifyWatcher, which already holds the one
  // app-level EventSource; opening a second stream here would double every
  // tab's upstream fan-out for no benefit.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismiss = useCallback(
    async (id: string) => {
      await api.dismissNotification(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ activeCount, records, loading, error, refresh: () => void refresh(), dismiss }),
    [activeCount, records, loading, error, refresh, dismiss],
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
      loading: false,
      error: "",
      refresh: () => {},
      dismiss: async () => {},
    }
  );
}
