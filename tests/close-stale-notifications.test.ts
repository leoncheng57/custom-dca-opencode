import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sessionTag, closeNotificationsForTag } from "../client/lib/closeStaleNotifications.js";

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
