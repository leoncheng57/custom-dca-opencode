interface UpdateCheckRegistration {
  update: () => Promise<unknown>;
}

interface UpdateCheckDocument {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}

interface UpdateCheckScheduler {
  setInterval: (handler: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

/**
 * How often to re-check for a new sw.js while the app stays open. Generous:
 * the foreground check below is what actually catches deploys on a phone, and
 * this interval only covers a tab left visible on a desk for hours.
 */
export const SW_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

/**
 * Asks the browser to re-fetch sw.js whenever the app returns to the
 * foreground, and hourly while it stays open.
 *
 * Without this, an installed PWA can run a stale worker indefinitely. The
 * browser only re-fetches sw.js on a full navigation, and an installed iOS
 * PWA is resumed from memory when tapped — no navigation ever happens, so
 * `updatefound` never fires and the Update banner decision 18 relies on is
 * never offered. Observed in production: three worker deploys in one evening,
 * and a device that had opened the app repeatedly was still executing a
 * worker from before all of them, with no banner ever shown.
 *
 * `update()` only downloads and installs; activation still waits for the
 * user's explicit Update tap, so decision 18's approval gate is unchanged —
 * this makes the gate reachable, not bypassed.
 */
export function scheduleSwUpdateChecks(
  registration: UpdateCheckRegistration,
  targetDocument: UpdateCheckDocument = document,
  scheduler: UpdateCheckScheduler = window,
): () => void {
  const check = () => {
    void registration.update().catch(() => undefined);
  };
  const onVisibilityChange = () => {
    if (targetDocument.visibilityState === "visible") check();
  };
  targetDocument.addEventListener("visibilitychange", onVisibilityChange);
  const timer = scheduler.setInterval(check, SW_UPDATE_CHECK_INTERVAL_MS);
  return () => {
    targetDocument.removeEventListener("visibilitychange", onVisibilityChange);
    scheduler.clearInterval(timer);
  };
}
