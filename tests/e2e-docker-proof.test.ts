import { describe, expect, it } from "vitest";

import { parseRepeat, percentile } from "../scripts/e2e-docker-proof.js";

// The stress harness runs real containers, so these cover only its pure
// argument and statistics helpers. The isolation claims themselves cannot be
// unit-tested — they are proven by running the harness, which is the point of
// it existing.

describe("--repeat parsing", () => {
  it("runs a single pair by default", () => {
    expect(parseRepeat([])).toBe(1);
  });

  it("reads an explicit count", () => {
    expect(parseRepeat(["--repeat", "10"])).toBe(10);
  });

  // The bound is not arbitrary: each pair builds an image and runs two full
  // suites, so a typo like `--repeat 1000` would occupy the machine for most of
  // a day before anyone noticed.
  it.each([
    ["zero", "0"],
    ["negative", "-3"],
    ["fractional", "2.5"],
    ["non-numeric", "ten"],
    ["above the ceiling", "51"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(() => parseRepeat(["--repeat", value])).toThrow(/--repeat must be an integer/u);
  });

  it("rejects a missing value rather than silently running once", () => {
    expect(() => parseRepeat(["--repeat"])).toThrow(/--repeat must be an integer/u);
  });
});

describe("percentile", () => {
  it("returns a real observation rather than an interpolation", () => {
    // Nearest-rank keeps p95 pointing at a run that actually happened, so a
    // reported number can always be traced back to one pair's log.
    const values = [10, 20, 30, 40];
    expect(values).toContain(percentile(values, 0.5));
    expect(values).toContain(percentile(values, 0.95));
  });

  it("computes p50 and p95 over a small sample", () => {
    const values = [50, 10, 40, 20, 30];
    expect(percentile(values, 0.5)).toBe(30);
    expect(percentile(values, 0.95)).toBe(50);
  });

  it("is order-independent", () => {
    expect(percentile([30, 10, 20], 0.5)).toBe(percentile([10, 20, 30], 0.5));
  });

  it("handles a single sample", () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.95)).toBe(42);
  });

  it("returns zero for no samples instead of NaN", () => {
    // A harness that crashed before timing anything must still write a summary.
    expect(percentile([], 0.5)).toBe(0);
  });
});
