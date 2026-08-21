import * as React from "react";
import { cn } from "./utils.js";

type AlertVariant = "info" | "success" | "warning" | "danger";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const variantClasses: Record<AlertVariant, string> = {
  info: "bg-[var(--color-background-surface-info-muted)] text-[var(--color-text-info)]",
  success: "bg-[var(--color-background-surface-success-muted)] text-[var(--color-text-success)]",
  warning: "bg-[var(--color-background-surface-warning-muted)] text-[var(--color-text-warning)]",
  danger: "bg-[var(--color-background-surface-danger-muted)] text-[var(--color-text-danger)]",
};

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "info", ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "rounded-[var(--border-radius-8)] p-4 text-sm",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

export { Alert };
export type { AlertProps, AlertVariant };
