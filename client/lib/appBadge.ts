interface BadgeNavigator {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

interface BadgeWorker {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
}

interface BadgeServiceWorkerContainer {
  controller?: BadgeWorker | null;
  ready?: Promise<{ active?: BadgeWorker | null }>;
}

async function beginWorkerBadge(
  worker: BadgeWorker,
  count: number,
  revision: number,
): Promise<{ accepted: boolean; acknowledge: () => void } | null> {
  const channel = new MessageChannel();
  try {
    return await new Promise<{ accepted: boolean; acknowledge: () => void } | null>((resolve) => {
      const timer = setTimeout(() => {
        channel.port1.close();
        resolve(null);
      }, 2_000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve({
          accepted: event.data?.accepted === true,
          acknowledge: () => {
            channel.port1.postMessage({ applied: true });
            channel.port1.close();
          },
        });
      };
      worker.postMessage({ type: "SYNC_BADGE", count, revision }, [channel.port2]);
    });
  } catch {
    channel.port1.close();
    return null;
  }
}

/** Best-effort synchronization for installed PWAs; unsupported browsers stay unchanged. */
export async function syncAppBadge(
  count: unknown,
  target: BadgeNavigator = navigator,
  revision?: unknown,
  serviceWorker: BadgeServiceWorkerContainer | undefined = typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
): Promise<boolean> {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return false;
  if (typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0) {
    const worker = serviceWorker?.controller ?? await serviceWorker?.ready?.then((registration) => registration.active).catch(() => null);
    if (worker) {
      const handshake = await beginWorkerBadge(worker, count, revision);
      if (!handshake) return false;
      if (!handshake.accepted) {
        handshake.acknowledge();
        return true;
      }
      try {
        return await applyBadge(count, target);
      } finally {
        handshake.acknowledge();
      }
    }
    if (serviceWorker) return false;
  }
  return applyBadge(count, target);
}

async function applyBadge(count: number, target: BadgeNavigator): Promise<boolean> {
  try {
    if (count === 0 && typeof target.clearAppBadge === "function") {
      await target.clearAppBadge();
      return true;
    }
    if (count === 0 && typeof target.setAppBadge === "function") {
      await target.setAppBadge(0);
      return true;
    }
    if (count > 0 && typeof target.setAppBadge === "function") {
      await target.setAppBadge(count);
      return true;
    }
  } catch {
    // Badging is presentation-only and must never break notification history.
  }
  return false;
}
