import { describe, expect, it, vi } from "vitest";

import { refreshApp } from "../client/lib/appRefresh.js";

describe("PWA app refresh", () => {
  it("checks and activates a waiting worker before reloading the current page", async () => {
    const postMessage = vi.fn();
    const update = vi.fn(async () => undefined);
    const reload = vi.fn();

    await refreshApp(
      { getRegistration: async () => ({ waiting: { postMessage }, update }) },
      { reload },
    );

    expect(update).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads without touching PWA state when worker inspection fails", async () => {
    const reload = vi.fn();
    await refreshApp({ getRegistration: async () => { throw new Error("worker unavailable"); } }, { reload });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("activates an update found while checking the worker", async () => {
    const postMessage = vi.fn();
    const registration = {
      waiting: null as { postMessage: (message: unknown) => void } | null,
      update: async () => { registration.waiting = { postMessage }; },
    };
    const reload = vi.fn();
    await refreshApp({ getRegistration: async () => registration }, { reload });
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalledOnce();
  });
});
