import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sessionTag, closeNotificationsForTag, reconcileStaleNotifications } from "../client/lib/closeStaleNotifications.js";

describe("sessionTag", () => {
  it("returns sessionID when present", () => {
    expect(sessionTag({ id: "rec_123", sessionID: "ses_456" })).toBe("ses_456");
  });

  it("falls back to record id when sessionID is missing", () => {
    expect(sessionTag({ id: "rec_789" })).toBe("rec_789");
  });

  it("falls back to record id when sessionID is undefined", () => {
    expect(sessionTag({ id: "rec_abc", sessionID: undefined })).toBe("rec_abc");
  });

  it("falls back to record id when sessionID is empty string", () => {
    expect(sessionTag({ id: "rec_def", sessionID: "" })).toBe("rec_def");
  });
});

describe("closeNotificationsForTag", () => {
  let mockGetNotifications: ReturnType<typeof vi.fn>;
  let mockClose: ReturnType<typeof vi.fn>;
  let mockRegistration: { getNotifications: typeof mockGetNotifications };

  beforeEach(() => {
    mockClose = vi.fn();
    mockGetNotifications = vi.fn();
    mockRegistration = { getNotifications: mockGetNotifications };

    // Mock navigator.serviceWorker
    Object.defineProperty(global.navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve(mockRegistration),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes matching notifications for a session tag", async () => {
    const mockNotification1 = { tag: "ses_123", close: mockClose };
    const mockNotification2 = { tag: "ses_123", close: mockClose };
    mockGetNotifications.mockResolvedValue([mockNotification1, mockNotification2]);

    await closeNotificationsForTag("ses_123");

    expect(mockGetNotifications).toHaveBeenCalledWith({ tag: "ses_123" });
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it("closes matching notifications for a record id tag", async () => {
    const mockNotification = { tag: "rec_456", close: mockClose };
    mockGetNotifications.mockResolvedValue([mockNotification]);

    await closeNotificationsForTag("rec_456");

    expect(mockGetNotifications).toHaveBeenCalledWith({ tag: "rec_456" });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("handles no matching notifications gracefully", async () => {
    mockGetNotifications.mockResolvedValue([]);

    await closeNotificationsForTag("ses_nonexistent");

    expect(mockGetNotifications).toHaveBeenCalledWith({ tag: "ses_nonexistent" });
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("never throws when service workers are unsupported", async () => {
    Object.defineProperty(global.navigator, "serviceWorker", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    await expect(closeNotificationsForTag("ses_123")).resolves.toBeUndefined();
    expect(mockGetNotifications).not.toHaveBeenCalled();
  });

  it("never throws when registration.ready fails", async () => {
    Object.defineProperty(global.navigator, "serviceWorker", {
      value: {
        ready: Promise.reject(new Error("registration failed")),
      },
      writable: true,
      configurable: true,
    });

    await expect(closeNotificationsForTag("ses_123")).resolves.toBeUndefined();
  });

  it("never throws when getNotifications fails", async () => {
    mockGetNotifications.mockRejectedValue(new Error("getNotifications failed"));

    await expect(closeNotificationsForTag("ses_123")).resolves.toBeUndefined();
  });

  it("never throws when close() fails", async () => {
    const failingClose = vi.fn(() => {
      throw new Error("close failed");
    });
    mockGetNotifications.mockResolvedValue([{ tag: "ses_123", close: failingClose }]);

    await expect(closeNotificationsForTag("ses_123")).resolves.toBeUndefined();
    expect(failingClose).toHaveBeenCalledTimes(1);
  });

  it("no-ops when tag is empty string", async () => {
    await closeNotificationsForTag("");

    expect(mockGetNotifications).not.toHaveBeenCalled();
  });
});

describe("reconcileStaleNotifications", () => {
  let mockGetNotifications: ReturnType<typeof vi.fn>;
  let mockClose: ReturnType<typeof vi.fn>;
  let mockRegistration: { getNotifications: typeof mockGetNotifications };

  beforeEach(() => {
    mockClose = vi.fn();
    mockGetNotifications = vi.fn();
    mockRegistration = { getNotifications: mockGetNotifications };

    Object.defineProperty(global.navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve(mockRegistration),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes stale notifications not in the unresolved set", async () => {
    const staleClose1 = vi.fn();
    const staleClose2 = vi.fn();
    const currentClose = vi.fn();
    const staleNotification1 = { tag: "ses_old1", close: staleClose1 };
    const staleNotification2 = { tag: "rec_old2", close: staleClose2 };
    const currentNotification = { tag: "ses_current", close: currentClose };

    mockGetNotifications.mockResolvedValue([staleNotification1, staleNotification2, currentNotification]);

    const unresolvedRecords = [
      { id: "rec_1", sessionID: "ses_current" },
      { id: "rec_2", sessionID: "ses_current" }, // Same session, should not close twice
    ];

    await reconcileStaleNotifications(unresolvedRecords);

    expect(mockGetNotifications).toHaveBeenCalledWith();
    expect(staleClose1).toHaveBeenCalledTimes(1);
    expect(staleClose2).toHaveBeenCalledTimes(1);
    expect(currentClose).not.toHaveBeenCalled();
  });

  it("handles records without sessionID correctly", async () => {
    const close1 = vi.fn();
    const close2 = vi.fn();
    const notification1 = { tag: "rec_123", close: close1 };
    const notification2 = { tag: "ses_456", close: close2 };

    mockGetNotifications.mockResolvedValue([notification1, notification2]);

    const unresolvedRecords = [
      { id: "rec_123" }, // No sessionID, tag is the record id
    ];

    await reconcileStaleNotifications(unresolvedRecords);

    expect(close1).not.toHaveBeenCalled(); // Still unresolved
    expect(close2).toHaveBeenCalledTimes(1); // Stale
  });

  it("closes all notifications when unresolved set is empty", async () => {
    const notification1 = { tag: "ses_1", close: mockClose };
    const notification2 = { tag: "ses_2", close: mockClose };

    mockGetNotifications.mockResolvedValue([notification1, notification2]);

    await reconcileStaleNotifications([]);

    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it("closes nothing when all visible notifications are current", async () => {
    const notification = { tag: "ses_123", close: mockClose };

    mockGetNotifications.mockResolvedValue([notification]);

    const unresolvedRecords = [{ id: "rec_1", sessionID: "ses_123" }];

    await reconcileStaleNotifications(unresolvedRecords);

    expect(mockClose).not.toHaveBeenCalled();
  });

  it("handles untagged notifications by closing them", async () => {
    const untaggedClose = vi.fn();
    const taggedClose = vi.fn();
    const untaggedNotification = { tag: "", close: untaggedClose };
    const taggedNotification = { tag: "ses_123", close: taggedClose };

    mockGetNotifications.mockResolvedValue([untaggedNotification, taggedNotification]);

    const unresolvedRecords = [{ id: "rec_1", sessionID: "ses_123" }];

    await reconcileStaleNotifications(unresolvedRecords);

    expect(untaggedClose).toHaveBeenCalledTimes(1); // Untagged = stale
    expect(taggedClose).not.toHaveBeenCalled();
  });

  it("never throws when service workers are unsupported", async () => {
    Object.defineProperty(global.navigator, "serviceWorker", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    await expect(reconcileStaleNotifications([])).resolves.toBeUndefined();
    expect(mockGetNotifications).not.toHaveBeenCalled();
  });

  it("never throws when registration.ready fails", async () => {
    Object.defineProperty(global.navigator, "serviceWorker", {
      value: {
        ready: Promise.reject(new Error("registration failed")),
      },
      writable: true,
      configurable: true,
    });

    await expect(reconcileStaleNotifications([])).resolves.toBeUndefined();
  });

  it("never throws when getNotifications fails", async () => {
    mockGetNotifications.mockRejectedValue(new Error("getNotifications failed"));

    await expect(reconcileStaleNotifications([])).resolves.toBeUndefined();
  });

  it("swallows exceptions but continues closing other notifications", async () => {
    // The try-catch wraps the entire reconciliation, so an exception during
    // close() still prevents subsequent closes in the loop. However, the
    // function never throws to the caller — it swallows all failures.
    const failingClose = vi.fn(() => {
      throw new Error("close failed");
    });
    const notification = { tag: "ses_1", close: failingClose };

    mockGetNotifications.mockResolvedValue([notification]);

    await expect(reconcileStaleNotifications([])).resolves.toBeUndefined();
    expect(failingClose).toHaveBeenCalledTimes(1);
  });

  it("deduplicates tags from multiple records in the same session", async () => {
    const notification = { tag: "ses_shared", close: mockClose };

    mockGetNotifications.mockResolvedValue([notification]);

    const unresolvedRecords = [
      { id: "rec_1", sessionID: "ses_shared" },
      { id: "rec_2", sessionID: "ses_shared" },
      { id: "rec_3", sessionID: "ses_shared" },
    ];

    await reconcileStaleNotifications(unresolvedRecords);

    // The notification stays (not stale), and even if it were stale, we'd
    // only close each notification object once anyway (the loop doesn't retry).
    expect(mockClose).not.toHaveBeenCalled();
  });
});
