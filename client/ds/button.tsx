import * as React from "react";
import { cn } from "./utils.js";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "accent-cyan"
  | "accent-purple"
  | "accent-green";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  /** When set, the Button auto-fires a `button_click` analytics event on
   *  every click with this value as the `controlId`. No manual
   *  `trackButtonClick()` call needed at the call site. */
  trackingId?: string;
  /** Optional structured context forwarded to the analytics event. */
  trackingContext?: Record<string, string | number | boolean | null>;
}

// Core variants use the shared design tokens: primary is the solid action
// blue, secondary a quiet outline on the surface. The accent-* aliases keep
// the older "pill-with-glow" look for pages that opt in explicitly
// (Superintendent Playground) — they are no longer the default.

const PRIMARY =
  "bg-[var(--color-background-action-primary)] text-white " +
  "hover:bg-[var(--color-background-action-primary-hover)] " +
  "active:bg-[var(--color-background-action-primary-hover)]";

const SECONDARY =
  "bg-[var(--color-background-surface)] text-[var(--color-text-default)] " +
  "shadow-[inset_0_0_0_1px_var(--hh-border)] " +
  "hover:bg-[var(--hh-row-hover)] active:bg-[var(--hh-row-hover)]";

const CYAN =
  "border bg-[light-dark(oklch(0.715_0.143_215.221/0.1),rgba(8,145,178,0.35))] border-[light-dark(oklch(0.609_0.126_221.723/0.4),#22d3ee)] " +
  "text-[light-dark(#0e7490,#a5f3fc)] " +
  "hover:bg-[light-dark(oklch(0.715_0.143_215.221/0.2),rgba(8,145,178,0.5))] hover:text-[light-dark(#155e75,white)] " +
  "active:bg-[light-dark(oklch(0.715_0.143_215.221/0.25),rgba(8,145,178,0.6))]";

const PURPLE =
  "border bg-[light-dark(oklch(0.627_0.265_303.9/0.1),rgba(230,168,255,0.3))] border-[light-dark(oklch(0.558_0.288_302.321/0.4),#E6A8FF)] " +
  "text-[light-dark(#7e22ce,#f0c9ff)] " +
  "hover:bg-[light-dark(oklch(0.627_0.265_303.9/0.2),rgba(230,168,255,0.45))] hover:text-[light-dark(#6b21a8,white)] " +
  "active:bg-[light-dark(oklch(0.627_0.265_303.9/0.25),rgba(230,168,255,0.55))]";

const GREEN =
  "border bg-[light-dark(oklch(0.696_0.17_162.48/0.1),rgba(5,150,105,0.35))] border-[light-dark(oklch(0.596_0.145_163.225/0.4),#34d399)] " +
  "text-[light-dark(#047857,#6ee7b7)] " +
  "hover:bg-[light-dark(oklch(0.696_0.17_162.48/0.2),rgba(5,150,105,0.5))] hover:text-[light-dark(#065f46,white)] " +
  "active:bg-[light-dark(oklch(0.696_0.17_162.48/0.25),rgba(5,150,105,0.6))]";

const RED =
  "border bg-[light-dark(oklch(0.637_0.237_25.331/0.1),rgba(220,38,38,0.35))] border-[light-dark(oklch(0.577_0.245_27.325/0.4),#f87171)] " +
  "text-[light-dark(#b91c1c,#fca5a5)] " +
  "hover:bg-[light-dark(oklch(0.637_0.237_25.331/0.2),rgba(220,38,38,0.5))] hover:text-[light-dark(#991b1b,white)] " +
  "active:bg-[light-dark(oklch(0.637_0.237_25.331/0.25),rgba(220,38,38,0.6))]";

const GHOST =
  "bg-transparent border border-transparent text-[var(--color-text-action-ghost)] " +
  "hover:bg-[light-dark(rgba(0,0,0,0.05),rgba(255,255,255,0.1))] hover:border-[light-dark(rgba(0,0,0,0.1),rgba(255,255,255,0.2))] " +
  "hover:text-[var(--color-text-default)] active:bg-[light-dark(rgba(0,0,0,0.1),rgba(255,255,255,0.15))]";

const variantClasses: Record<ButtonVariant, string> = {
  // ── Core variants ────────────────────────────────────────────────────
  primary: PRIMARY,
  secondary: SECONDARY,
  danger: RED,
  ghost: GHOST,

  // ── Accent aliases (kept for backward-compat) ───────────────────────
  "accent-cyan": CYAN,
  "accent-purple": PURPLE,
  "accent-green": GREEN,
};

// Coarse pointers (phones/tablets) bump every size to ≥40px so buttons meet
// touch-target guidelines — `sm` is 32px tall on desktop, unusable on glass.
const sizeClasses: Record<"sm" | "md" | "lg", string> = {
  sm: "h-8 px-3 text-xs pointer-coarse:h-10 pointer-coarse:px-4",
  md: "h-9 px-4 text-sm pointer-coarse:h-11",
  lg: "h-10 px-6 text-base pointer-coarse:h-11",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, trackingId, trackingContext, onClick, ...props }, ref) => {
    // Analytics tracking stripped in the standalone runner; trackingId /
    // trackingContext props are accepted (call sites keep them) but ignored.
    void trackingId;
    void trackingContext;
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-[6px] font-semibold cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]",
          "disabled:pointer-events-none disabled:opacity-40 disabled:cursor-default",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        disabled={disabled}
        onClick={handleClick}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
export type { ButtonProps, ButtonVariant };
