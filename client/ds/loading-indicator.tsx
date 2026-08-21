import * as React from "react";
import { cn } from "./utils.js";

interface LoadingIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  label?: string;
}

const sizeClasses: Record<"sm" | "md" | "lg", string> = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-3",
};

const LoadingIndicator = React.forwardRef<HTMLDivElement, LoadingIndicatorProps>(
  ({ className, size = "md", label, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col items-center gap-3", className)} {...props}>
      <div
        className={cn(
          "animate-spin rounded-full border-[var(--color-border-default)] border-t-[var(--color-background-action-primary)]",
          sizeClasses[size],
        )}
      />
      {label && <p className="text-sm text-[var(--color-text-muted)]">{label}</p>}
    </div>
  ),
);
LoadingIndicator.displayName = "LoadingIndicator";

export { LoadingIndicator };
export type { LoadingIndicatorProps };
