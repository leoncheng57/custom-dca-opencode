import { describe, expect, it } from "vitest";

import type { NotificationRecord, NotifyEvent, SessionSummary } from "../client/lib/api.js";
import {
  STATUS_DIRECTORY_LIMIT,
  STATUS_SESSION_LIMIT,
  runStateFor,
  runStateMap,
  statusCandidates,
} from "../client/lib/sessionRunState.js";

function record(overrides: Partial<NotificationRecord> & { id: string; at: number }): NotificationRecord {
  return {
    kind: "idle" as NotifyEvent,
    title: "OpenCode finished",
    body: "",
    delivery: { ntfy: "off", desktop: "off" },
    ...overrides,
  };
}

function session(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
  return {
    title: "A session",
    directory: "/srv/work",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    createdAt: "2026-08-22T12:00:00.000Z",
    updatedAt: "2026-08-22T12:00:00.000Z",
    archived: false,
    running: false,
    ...overrides,
  } as SessionSummary;
}

describe("notification session status candidates", () => {
  it("asks about each session once, newest first", () => {
    const { sessionIDs, directories } = statusCandidates([
      record({ id: "a", at: 30, sessionID: "ses_1", directory: "/srv/one" }),
      record({ id: "b", at: 20, sessionID: "ses_1", directory: "/srv/one" }),
      record({ id: "c", at: 10, sessionID: "ses_2", directory: "/srv/two" }),
    ]);

    expect(sessionIDs).toEqual(["ses_1", "ses_2"]);
    expect(directories).toEqual(["/srv/one", "/srv/two"]);
  });

  it("skips records the server never attached a session to", () => {
    // They group into the no-session bucket, which has nothing to report on.
    const { sessionIDs, directories } = statusCandidates([
      record({ id: "a", at: 20, directory: "/srv/one" }),
      record({ id: "b", at: 10, sessionID: "ses_1", directory: "/srv/two" }),
    ]);

    expect(sessionIDs).toEqual(["ses_1"]);
    // /srv/one carried no session worth asking about, so fanning out to it
    // would cost two upstream calls for nothing.
    expect(directories).toEqual(["/srv/two"]);
  });

  it("spends the id budget on unresolved work before the resolved archive", () => {
    // Resolution is manual-only (AGENTS.md decision 10), so the archive shares
    // the window with the few rows that still need action. In raw order the
    // archive would consume the cap and leave the rows whose status actually
    // changes a decision reading `unknown`.
    const records = [
      ...Array.from({ length: 5 }, (_, index) =>
        record({ id: `r${index}`, at: 1000 - index, sessionID: `ses_resolved_${index}`, directory: "/srv/one", resolvedAt: 2000 }),
      ),
      record({ id: "active", at: 1, sessionID: "ses_active", directory: "/srv/one" }),
    ];

    const { sessionIDs } = statusCandidates(records, { sessions: 2 });

    expect(sessionIDs[0]).toBe("ses_active");
    expect(sessionIDs).toHaveLength(2);
  });

  it("caps both axes at the server's own limits", () => {
    // Sending more than the route accepts would just be silently sliced
    // server-side; anything past the cap reads `unknown`, which is honest.
    const records = Array.from({ length: 200 }, (_, index) =>
      record({ id: `r${index}`, at: 1000 - index, sessionID: `ses_${index}`, directory: `/srv/dir_${index}` }),
    );

    const { sessionIDs, directories } = statusCandidates(records);

    expect(sessionIDs).toHaveLength(STATUS_SESSION_LIMIT);
    expect(directories.length).toBeLessThanOrEqual(STATUS_DIRECTORY_LIMIT);
    // Newest survives the cap.
    expect(sessionIDs[0]).toBe("ses_0");
  });

  it("returns nothing to ask about for an empty window", () => {
    expect(statusCandidates([])).toEqual({ directories: [], sessionIDs: [] });
  });
});

describe("notification session run state", () => {
  it("reports running and idle only for sessions the fan-out answered", () => {
    const map = runStateMap([
      session({ id: "ses_busy", running: true }),
      session({ id: "ses_quiet", running: false }),
    ]);

    expect(runStateFor(map, "ses_busy")).toBe("running");
    expect(runStateFor(map, "ses_quiet")).toBe("idle");
  });

  it("answers unknown for a session the fan-out never covered", () => {
    // `/session/status` is process-local, so a session nobody currently owns
    // has no status the client can honestly claim. Absence is not idle.
    const map = runStateMap([session({ id: "ses_known" })]);

    expect(runStateFor(map, "ses_missing")).toBe("unknown");
  });

  it("answers unknown for a record with no session at all", () => {
    expect(runStateFor(runStateMap([]), undefined)).toBe("unknown");
  });

  it("degrades an empty answer to unknown rather than to idle", () => {
    // This is the shape a failed fetch takes: the join sets an empty map, and
    // every row must read `unknown`. A confident `idle` on a session that is
    // in fact mid-turn is the one outcome worth engineering against.
    const map = runStateMap([]);

    expect(runStateFor(map, "ses_1")).toBe("unknown");
  });
});
