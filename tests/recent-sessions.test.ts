import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../client/lib/api.js";
import {
  MAX_STORED_RECENT_SESSIONS,
  RECENT_SESSIONS_STORAGE_KEY,
  readRecentSessionOpens,
  recentDirectories,
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

describe("recent directories", () => {
  it("lists distinct canonical projects newest first", () => {
    expect(recentDirectories([
      { id: "a", directory: "/repo/", openedAt: 4 },
      { id: "b", directory: "/other", openedAt: 3 },
      { id: "c", directory: "/repo", openedAt: 2 },
      { id: "d", directory: "   ", openedAt: 1 },
    ])).toEqual(["/repo", "/other"]);
  });

  it("bounds the list", () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      directory: `/repo-${index}`,
      openedAt: index,
    }));
    expect(recentDirectories(entries, 3)).toEqual(["/repo-0", "/repo-1", "/repo-2"]);
  });
});

describe("recent session views", () => {
  const sessions = [
    session("first", "/repo", "2026-01-01T12:00:00.000Z"),
    session("second", "/repo/", "2026-01-01T12:00:00.000Z"),
    session("other", "/other", "2027-01-01T12:00:00.000Z"),
  ];

  it("spans projects and orders active sessions newest first", () => {
    expect(recentlyActiveSessions(sessions).map(({ id }) => id)).toEqual(["other", "first", "second"]);
  });

  it("keeps input order when active timestamps are equal", () => {
    expect(recentlyActiveSessions(sessions.slice(0, 2)).map(({ id }) => id)).toEqual(["first", "second"]);
  });

  it("resolves opened entries across projects and drops stale ones", () => {
    const entries = [
      { id: "other", directory: "/other", openedAt: 4 },
      { id: "missing", directory: "/repo", openedAt: 3 },
      { id: "second", directory: "/repo/", openedAt: 2 },
      { id: "first", directory: "/repo", openedAt: 1 },
    ];
    expect(recentlyOpenedSessions(sessions, entries).map(({ id }) => id)).toEqual([
      "other",
      "second",
      "first",
    ]);
  });

  it("matches on project and id together, never id alone", () => {
    // The same id in two projects must not cross-render: ids are unique per
    // project, not globally.
    const collision = [
      session("shared", "/repo", "2026-01-01T12:00:00.000Z"),
      session("shared", "/other", "2027-01-01T12:00:00.000Z"),
    ];
    expect(recentlyOpenedSessions(collision, [{ id: "shared", directory: "/other", openedAt: 1 }]))
      .toEqual([collision[1]]);
    expect(recentlyOpenedSessions(collision, [{ id: "shared", directory: "/absent", openedAt: 1 }]))
      .toEqual([]);
  });

  it("honors maximum visible bounds", () => {
    expect(recentlyOpenedSessions(sessions, [
      { id: "first", directory: "/repo", openedAt: 2 },
      { id: "second", directory: "/repo", openedAt: 1 },
    ], 1).map(({ id }) => id)).toEqual(["first"]);
    expect(recentlyActiveSessions(sessions, 1).map(({ id }) => id)).toEqual(["other"]);
    expect(recentlyActiveSessions(sessions, -1)).toEqual([]);

    const manySessions = Array.from({ length: 10 }, (_, index) => session(
      `session-${index}`,
      "/repo",
      new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    ));
    expect(recentlyActiveSessions(manySessions, 100)).toHaveLength(5);
  });
});
