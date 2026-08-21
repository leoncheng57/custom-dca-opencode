import * as React from "react";
import { cn } from "./utils.js";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "pro" | "beta" | "counter";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  // Status badges pair the design-system muted-surface bg + matching
  // text token, then layer a translucent colored border so they share
  // the pill-with-tinted-outline look of the Superintendent buttons.
  neutral:
    "bg-[var(--color-background-surface-neutral-muted)] text-[var(--color-text-default)] border border-[var(--color-border-default)]",
  info:
    "bg-[var(--color-background-surface-info-muted)] text-[var(--color-text-info)] border border-blue-500/40",
  success:
    "bg-[var(--color-background-surface-success-muted)] text-[var(--color-text-success)] border border-emerald-500/40",
  warning:
    "bg-[var(--color-background-surface-warning-muted)] text-[var(--color-text-warning)] border border-amber-500/40",
  danger:
    "bg-[var(--color-background-surface-danger-muted)] text-[var(--color-text-danger)] border border-red-500/40",
  pro: "bg-[var(--color-purple-100)] text-[var(--color-purple-700)]",
  beta: "bg-[var(--color-blue-100)] text-[var(--color-blue-700)]",
  // Numeric counter: solid fill so it reads as "unanswered" at nav size, and
  // tabular digits so the pill does not jitter as the count changes.
  counter:
    "bg-[var(--color-background-surface-danger)] text-[var(--color-text-on-danger)] justify-center min-w-5 px-1.5 tabular-nums",
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge };
export type { BadgeVariant, BadgeProps };
