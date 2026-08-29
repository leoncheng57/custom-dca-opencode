import { useEffect, useState } from "react";

import { Button } from "../ds/button.js";
import { scheduleSwUpdateChecks } from "../lib/swUpdateCheck.js";

export function ServiceWorkerUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    let disposed = false;
    let stopUpdateChecks: (() => void) | undefined;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (disposed) return;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) setWaiting(installing);
        });
      });
      // Registration alone re-fetches sw.js only on a full navigation, which
      // an installed PWA resumed from memory never performs — so without an
      // explicit check the Update banner never appears on the platform that
      // needs it most. Activation still waits for the user's tap.
      stopUpdateChecks = scheduleSwUpdateChecks(registration);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      stopUpdateChecks?.();
    };
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-3 shadow-lg" role="status" data-testid="opencode-service-worker-update">
      <span className="text-sm">An app update is ready.</span>
      <Button size="sm" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })} data-testid="opencode-service-worker-update-apply">Update</Button>
      <Button size="sm" variant="secondary" onClick={() => setWaiting(null)} data-testid="opencode-service-worker-update-later">Later</Button>
    </div>
  );
}
