import { describe, expect, it, vi } from "vitest";

import { syncAppBadge } from "../client/lib/appBadge.js";

describe("installed PWA app badges", () => {
  it("sets and clears authoritative counts without failing unsupported clients", async () => {
    const setAppBadge = vi.fn(async () => undefined);
    const clearAppBadge = vi.fn(async () => undefined);
    const postMessage = vi.fn((_message: unknown, transfer?: Transferable[]) => {
      const port = transfer?.[0] as MessagePort | undefined;
      port?.postMessage({ accepted: true });
    });
    const target = { setAppBadge, clearAppBadge };

    await expect(syncAppBadge(7, target, 12, { controller: { postMessage } })).resolves.toBe(true);
    expect(setAppBadge).toHaveBeenCalledWith(7);
    expect(postMessage).toHaveBeenCalledWith({ type: "SYNC_BADGE", count: 7, revision: 12 }, expect.any(Array));
    await expect(syncAppBadge(7, target)).resolves.toBe(true);
    expect(setAppBadge).toHaveBeenCalledWith(7);
    await expect(syncAppBadge(0, target)).resolves.toBe(true);
    expect(clearAppBadge).toHaveBeenCalledOnce();
    await expect(syncAppBadge(undefined, target)).resolves.toBe(false);
    await expect(syncAppBadge(3, {})).resolves.toBe(false);
  });

  it("treats browser badging failures as non-fatal presentation errors", async () => {
    await expect(syncAppBadge(2, {
      setAppBadge: vi.fn(async () => { throw new Error("not installed"); }),
    })).resolves.toBe(false);
  });

  it("ignores malformed counts and revisions", async () => {
    const postMessage = vi.fn();
    await expect(syncAppBadge(-1, {}, 2, { controller: { postMessage } })).resolves.toBe(false);
    await syncAppBadge(2, {}, -1, { controller: { postMessage } });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not apply a stale snapshot rejected by the controlling worker", async () => {
    const setAppBadge = vi.fn(async () => undefined);
    const postMessage = vi.fn((_message: unknown, transfer?: Transferable[]) => {
      (transfer?.[0] as MessagePort | undefined)?.postMessage({ accepted: false });
    });
    await expect(syncAppBadge(3, { setAppBadge }, 3, { controller: { postMessage } })).resolves.toBe(true);
    expect(setAppBadge).not.toHaveBeenCalled();
  });
});
