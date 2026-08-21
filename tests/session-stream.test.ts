import { describe, expect, it } from "vitest";

import { streamRetryDelay } from "../client/lib/useSessionStream.js";
import {
  appendOlderPage,
  emptyTranscriptPages,
  fetchAllMessagePages,
  invalidateOlderPages,
  nextRevertState,
  mergeMessagePages,
  refreshNewestPage,
  transcriptMessages,
} from "../client/lib/messagePages.js";
import type { RawMessage } from "../client/lib/events.js";

function message(id: string, created: number, text = id): RawMessage {
  return {
    info: { id, time: { created } },
    parts: [{ id: `${id}-part`, messageID: id, type: "text", text }],
  };
}

describe("session SSE retry backoff", () => {
  it("continues beyond the old 14-second retry window with a bounded delay", () => {
    expect([0, 1, 2, 3, 4, 5, 100].map(streamRetryDelay)).toEqual([
      2_000,
      4_000,
      8_000,
      16_000,
      30_000,
      30_000,
      30_000,
    ]);
  });
});

describe("transcript page merging", () => {
  it("deduplicates overlapping pages and keeps chronological order", () => {
    const merged = mergeMessagePages(
      [message("msg_3", 3), message("msg_4", 4)],
      [message("msg_1", 1), message("msg_2", 2), message("msg_3", 3)],
    );

    expect(merged.map((item) => item.info?.id)).toEqual(["msg_1", "msg_2", "msg_3", "msg_4"]);
    expect(merged).toHaveLength(4);
  });

  it("lets a newest-page refresh replace a streaming message without changing its identity", () => {
    const updated = message("msg_2", 2, "longer streamed output");
    const merged = mergeMessagePages(
      [message("msg_1", 1), message("msg_2", 2, "partial")],
      [updated],
    );

    expect(merged.map((item) => item.info?.id)).toEqual(["msg_1", "msg_2"]);
    expect(merged[1]).toBe(updated);
    expect(merged[1].parts?.[0].id).toBe("msg_2-part");
  });

  it("keeps loaded history unchanged for an empty end-of-history page", () => {
    const loaded = [message("msg_1", 1), message("msg_2", 2)];
    expect(mergeMessagePages(loaded, [])).toBe(loaded);
    expect(mergeMessagePages([], [])).toEqual([]);
  });

  it("uses stable part identity when malformed messages lack an info id", () => {
    const old: RawMessage = { parts: [{ id: "part_1", type: "text", text: "old" }] };
    const updated: RawMessage = { parts: [{ id: "part_1", type: "text", text: "updated" }] };
    expect(mergeMessagePages([old], [updated])).toEqual([updated]);
  });

  it("treats the newest window as authoritative while preserving deliberate backfill", () => {
    let pages = refreshNewestPage(emptyTranscriptPages(), [message("msg_3", 3), message("msg_4", 4)], "2", false);
    pages = appendOlderPage(pages, [message("msg_1", 1), message("msg_2", 2), message("msg_3", 3)]);
    pages = refreshNewestPage(pages, [message("msg_4", 4, "updated")], "3", true, 2);

    expect(transcriptMessages(pages).map((item) => item.info?.id)).toEqual(["msg_1", "msg_2", "msg_4"]);
    expect(transcriptMessages(pages).at(-1)?.parts?.[0].text).toBe("updated");
  });

  it("removes deleted messages from the authoritative newest window", () => {
    const initial = refreshNewestPage(emptyTranscriptPages(), [message("msg_1", 1), message("msg_2", 2)], "older", false);
    const refreshed = refreshNewestPage(initial, [message("msg_2", 2)], "older", true, 2);
    expect(transcriptMessages(refreshed).map((item) => item.info?.id)).toEqual(["msg_2"]);
  });

  it("accepts same-length reverts and clears stale history on an empty authoritative response", () => {
    const initial = refreshNewestPage(emptyTranscriptPages(), [message("msg_1", 1, "first")], "older", false);
    const reverted = refreshNewestPage(initial, [message("msg_1", 1, "again")], "older", true);
    expect(transcriptMessages(reverted)[0].parts?.[0].text).toBe("again");
    expect(transcriptMessages(refreshNewestPage(reverted, [], null, true))).toEqual([]);
  });

  it("fetches more than 100 messages to completion in chronological order", async () => {
    const all = Array.from({ length: 225 }, (_, index) => message(`msg_${String(index + 1).padStart(3, "0")}`, index + 1));
    const cursors: Array<string | undefined> = [];
    const complete = await fetchAllMessagePages(async (before) => {
      cursors.push(before);
      const end = before ? Number(before) : all.length;
      const start = Math.max(0, end - 100);
      return { messages: all.slice(start, end), nextCursor: start > 0 ? String(start) : null };
    });

    expect(cursors).toEqual([undefined, "125", "25"]);
    expect(complete).toHaveLength(225);
    expect(complete.map((item) => item.info?.id)).toEqual(all.map((item) => item.info?.id));
  });

  it("invalidates stale content when a mutated message belongs to older backfill", () => {
    const pages = { newest: [message("new", 3)], older: [message("old", 1, "stale"), message("middle", 2)] };
    expect(transcriptMessages(invalidateOlderPages(pages, "old"))).toEqual([pages.newest[0]]);
    expect(invalidateOlderPages(pages, "missing")).toBe(pages);
  });

  it("detects revert and unrevert transitions without treating routine session updates as mutations", () => {
    const routine = nextRevertState(undefined, undefined);
    expect(routine).toEqual({ state: null, changed: false });
    const reverted = nextRevertState(routine.state, { messageID: "msg_old", partID: "prt_old" });
    expect(reverted.changed).toBe(true);
    expect(nextRevertState(reverted.state, { messageID: "msg_old", partID: "prt_old" }).changed).toBe(false);
    expect(nextRevertState(reverted.state, undefined)).toEqual({ state: null, changed: true });
  });
});
