import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../client/lib/api.js";
import {
  MAX_STORED_RECENT_SESSIONS,
  RECENT_SESSIONS_STORAGE_KEY,
  readRecentSessionOpens,
  recentlyActiveSessions,
  recentlyOpenedSessions,
  recordRecentSessionOpen,
} from "../client/lib/recentSessions.js";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(RECENT_SESSIONS_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function session(id: string, directory: string, updatedAt: string): SessionSummary {
  return {
    id,
    directory,
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    createdAt: updatedAt,
    updatedAt,
    archived: false,
    running: false,
  };
}

describe("recent sessions storage", () => {
  it("ignores corrupted and unknown JSON shapes", () => {
    expect(readRecentSessionOpens(memoryStorage("{"))).toEqual([]);
    expect(readRecentSessionOpens(memoryStorage(JSON.stringify({ surprise: true })))).toEqual([]);
  });

  it("rejects a version mismatch", () => {
    const storage = memoryStorage(JSON.stringify({ version: 2, entries: [{ id: "one", directory: "/repo", openedAt: 1 }] }));
    expect(readRecentSessionOpens(storage)).toEqual([]);
  });

  it("drops malformed rows while preserving valid rows", () => {
    const storage = memoryStorage(JSON.stringify({
      version: 1,
      entries: [
        null,
        { id: "", directory: "/repo", openedAt: 1 },
        { id: "bad-time", directory: "/repo", openedAt: "now" },
        { id: "good", directory: "/repo", openedAt: 2 },
      ],
    }));
    expect(readRecentSessionOpens(storage)).toEqual([{ id: "good", directory: "/repo", openedAt: 2 }]);
  });

  it("updates the timestamp when the same session is opened again", () => {
    const storage = memoryStorage();
    recordRecentSessionOpen(storage, "/repo/", "one", 10);
    recordRecentSessionOpen(storage, "/repo", "two", 20);
    recordRecentSessionOpen(storage, "/repo", "one", 30);
    expect(readRecentSessionOpens(storage)).toEqual([
      { id: "one", directory: "/repo", openedAt: 30 },
      { id: "two", directory: "/repo", openedAt: 20 },
    ]);
  });

  it("bounds persisted rows", () => {
    const storage = memoryStorage();
    for (let index = 0; index < MAX_STORED_RECENT_SESSIONS + 5; index += 1) {
      recordRecentSessionOpen(storage, "/repo", `session-${index}`, index);
    }
    const entries = readRecentSessionOpens(storage);
    expect(entries).toHaveLength(MAX_STORED_RECENT_SESSIONS);
    expect(entries[0]?.id).toBe(`session-${MAX_STORED_RECENT_SESSIONS + 4}`);
  });
});

describe("recent session views", () => {
  const sessions = [
    session("first", "/repo", "2026-01-01T12:00:00.000Z"),
    session("second", "/repo/", "2026-01-01T12:00:00.000Z"),
    session("other", "/other", "2027-01-01T12:00:00.000Z"),
  ];

  it("uses canonical directory scope and filters stale sessions", () => {
    const entries = [
      { id: "other", directory: "/other", openedAt: 4 },
      { id: "missing", directory: "/repo", openedAt: 3 },
      { id: "second", directory: "/repo/", openedAt: 2 },
      { id: "first", directory: "/repo", openedAt: 1 },
    ];
    expect(recentlyOpenedSessions("/repo/", sessions, entries).map(({ id }) => id)).toEqual(["second", "first"]);
    expect(recentlyActiveSessions("/repo/", sessions).map(({ id }) => id)).toEqual(["first", "second"]);
  });

  it("keeps input order when active timestamps are equal", () => {
    expect(recentlyActiveSessions("/repo", sessions).map(({ id }) => id)).toEqual(["first", "second"]);
  });

  it("honors maximum visible bounds", () => {
    expect(recentlyOpenedSessions("/repo", sessions, [
      { id: "first", directory: "/repo", openedAt: 2 },
      { id: "second", directory: "/repo", openedAt: 1 },
    ], 1).map(({ id }) => id)).toEqual(["first"]);
    expect(recentlyActiveSessions("/repo", sessions, 1).map(({ id }) => id)).toEqual(["first"]);
    expect(recentlyActiveSessions("/repo", sessions, -1)).toEqual([]);

    const manySessions = Array.from({ length: 10 }, (_, index) => session(
      `session-${index}`,
      "/repo",
      new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    ));
    expect(recentlyActiveSessions("/repo", manySessions, 100)).toHaveLength(5);
  });
});
