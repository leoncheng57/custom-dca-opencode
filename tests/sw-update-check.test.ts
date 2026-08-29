import { describe, expect, it, vi } from "vitest";

import { scheduleSwUpdateChecks, SW_UPDATE_CHECK_INTERVAL_MS } from "../client/lib/swUpdateCheck.js";

// vitest runs in a node environment (no window); fake timers patch the globals.
const globalScheduler = {
  setInterval: (handler: () => void, ms: number) => setInterval(handler, ms) as unknown as number,
  clearInterval: (id: number) => clearInterval(id as unknown as ReturnType<typeof setInterval>),
};

function fakeDocument(initial = "hidden") {
  const listeners = new Set<() => void>();
  return {
    visibilityState: initial,
    addEventListener: (_type: "visibilitychange", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "visibilitychange", listener: () => void) => listeners.delete(listener),
    show() {
      this.visibilityState = "visible";
      for (const listener of listeners) listener();
    },
    hide() {
      this.visibilityState = "hidden";
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

describe("service worker update checks", () => {
  // The browser re-fetches sw.js only on a full navigation, and an installed
  // iOS PWA resumed from memory never navigates — so without these checks the
  // Update banner decision 18 depends on is never offered. Observed live:
  // three worker deploys in one evening, a device that opened the app
  // repeatedly, and a worker from before all of them still executing.
  it("re-checks when the app returns to the foreground", () => {
    const update = vi.fn(async () => undefined);
    const doc = fakeDocument();
    scheduleSwUpdateChecks({ update }, doc, { setInterval: () => 1, clearInterval: () => undefined });

    doc.show();
    expect(update).toHaveBeenCalledTimes(1);
    doc.hide();
    expect(update).toHaveBeenCalledTimes(1);
    doc.show();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("re-checks on a timer while the app stays open", () => {
    vi.useFakeTimers();
    try {
      const update = vi.fn(async () => undefined);
      scheduleSwUpdateChecks({ update }, fakeDocument(), globalScheduler);
      vi.advanceTimersByTime(SW_UPDATE_CHECK_INTERVAL_MS * 2);
      expect(update).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops checking after dispose", () => {
    vi.useFakeTimers();
    try {
      const update = vi.fn(async () => undefined);
      const doc = fakeDocument();
      const stop = scheduleSwUpdateChecks({ update }, doc, globalScheduler);

      stop();
      doc.show();
      vi.advanceTimersByTime(SW_UPDATE_CHECK_INTERVAL_MS * 3);

      expect(update).not.toHaveBeenCalled();
      expect(doc.listenerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("survives a failing update()", () => {
    const update = vi.fn(async () => { throw new Error("offline"); });
    const doc = fakeDocument();
    scheduleSwUpdateChecks({ update }, doc, { setInterval: () => 1, clearInterval: () => undefined });
    doc.show();
    doc.hide();
    doc.show();
    // No unhandled rejection, and later checks still fire.
    expect(update).toHaveBeenCalledTimes(2);
  });
});
