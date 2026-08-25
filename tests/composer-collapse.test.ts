import { describe, expect, it } from "vitest";

import { createComposerCollapseGuard } from "../client/lib/composerCollapse.js";

const narrowOutside = { narrowViewport: true, focusInsideComposer: false };

describe("composer collapse guard", () => {
  it("collapses on a plain blur on a narrow viewport", () => {
    const guard = createComposerCollapseGuard();
    guard.markComposerFocus();
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(true);
  });

  it("never collapses while focus stays inside the composer card", () => {
    const guard = createComposerCollapseGuard();
    guard.markComposerFocus();
    expect(guard.shouldCollapseOnBlur({ narrowViewport: true, focusInsideComposer: true })).toBe(false);
  });

  it("never collapses on a wide viewport", () => {
    const guard = createComposerCollapseGuard();
    guard.markComposerFocus();
    expect(guard.shouldCollapseOnBlur({ narrowViewport: false, focusInsideComposer: false })).toBe(false);
  });

  // The regression this module exists for: on touch, pointerdown fires at
  // finger-DOWN and the textarea blur at finger-UP, frames apart. The excuse
  // must survive until the blur arrives, however late that is.
  it("a control press excuses the next blur, however many frames later it fires", () => {
    const guard = createComposerCollapseGuard();
    guard.markComposerFocus();
    guard.markControlInteraction();
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(false);
  });

  it("one press excuses exactly one blur", () => {
    const guard = createComposerCollapseGuard();
    guard.markComposerFocus();
    guard.markControlInteraction();
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(false);
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(true);
  });

  it("repeated presses before one blur still excuse only that blur", () => {
    const guard = createComposerCollapseGuard();
    guard.markComposerFocus();
    guard.markControlInteraction();
    guard.markControlInteraction();
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(false);
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(true);
  });

  // A press that never produced a blur (textarea was not focused) must not
  // excuse a later unrelated blur: regaining focus disarms it.
  it("focusing the composer disarms a stale control press", () => {
    const guard = createComposerCollapseGuard();
    guard.markControlInteraction();
    guard.markComposerFocus();
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(true);
  });

  it("a press is consumed even when the viewport is wide, keeping states in step", () => {
    const guard = createComposerCollapseGuard();
    guard.markComposerFocus();
    guard.markControlInteraction();
    expect(guard.shouldCollapseOnBlur({ narrowViewport: false, focusInsideComposer: false })).toBe(false);
    expect(guard.shouldCollapseOnBlur(narrowOutside)).toBe(true);
  });
});
