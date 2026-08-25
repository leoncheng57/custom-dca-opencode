interface RefreshRegistration {
  waiting: { postMessage: (message: unknown) => void } | null;
  update: () => Promise<unknown>;
}

interface RefreshServiceWorkerContainer {
  getRegistration: () => Promise<RefreshRegistration | undefined>;
}

interface RefreshLocation {
  reload: () => void;
}

/** Reload the visible app without clearing any browser or PWA state. */
export async function refreshApp(
  serviceWorker: RefreshServiceWorkerContainer | undefined = typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
  location: RefreshLocation = window.location,
): Promise<void> {
  try {
    const registration = await serviceWorker?.getRegistration();
    await registration?.update();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    // A reload still restores live state when worker inspection is unavailable.
  }
  location.reload();
}
