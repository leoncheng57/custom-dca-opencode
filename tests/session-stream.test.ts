import { describe, expect, it } from "vitest";

import { mergeMessagePages, streamRetryDelay } from "../client/lib/useSessionStream.js";
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
});
