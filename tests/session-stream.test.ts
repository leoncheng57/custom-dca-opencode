import { describe, expect, it } from "vitest";

import { streamRetryDelay } from "../client/lib/useSessionStream.js";

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
