import { describe, expect, it } from "vitest";

import { buttonClasses } from "../client/ds/button.js";

// `buttonClasses` exists so the notification row's Open control can be an
// anchor — middle-click and cmd-click belong to the element, not to a click
// handler — while still rendering exactly what `Button` renders. That only
// holds while the two share one implementation, and the failure mode if they
// drift is silent: a link-shaped button that merely looks close.

describe("buttonClasses", () => {
  it("carries the shared base, the variant fill and the size", () => {
    const classes = buttonClasses({ variant: "info", size: "sm" });

    expect(classes).toContain("inline-flex");
    expect(classes).toContain("rounded-[6px]");
    expect(classes).toContain("focus-visible:ring-[var(--color-border-focus)]");
    expect(classes).toContain("bg-[var(--color-background-action-info)]");
    // Coarse pointers get the design system's 40px touch floor.
    expect(classes).toContain("pointer-coarse:h-10");
  });

  it("defaults to the same variant and size Button defaults to", () => {
    expect(buttonClasses()).toBe(buttonClasses({ variant: "primary", size: "md" }));
  });

  it("keeps navigate and resolve visually distinguishable", () => {
    // The notification row puts these side by side. This app's primary token is
    // green and is already spent on Resolve, so Open uses info; two identical
    // solid buttons would have to be decoded rather than recognised.
    expect(buttonClasses({ variant: "info" })).not.toBe(buttonClasses({ variant: "primary" }));
    expect(buttonClasses({ variant: "info" })).not.toContain("action-primary");
  });

  it("lets a call site append without losing the base", () => {
    const classes = buttonClasses({ variant: "info", size: "sm", className: "min-h-11" });

    expect(classes).toContain("min-h-11");
    expect(classes).toContain("inline-flex");
  });
});
