// client/ds/file-reference.tsx
//
// The control a verified workspace reference renders as.
//
// Presentational only: it is handed a path and a callback and knows nothing
// about validation. That separation is what lets the transcript, attachment
// chips and any later surface share one appearance and one accessible name
// while the decision to *offer* the control stays in one place.

import { cn } from "./utils.js";

export function FileReference({
  path,
  /** Rendered label. Defaults to the path, which is what prose usually cites. */
  children,
  lineLabel = "",
  onOpen,
  className,
  testId = "opencode-file-reference",
}: {
  path: string;
  children?: React.ReactNode;
  lineLabel?: string;
  onOpen: () => void;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      // The name states the destination and the action. "scripts/launchd.ts"
      // alone reads as a filename, not as something that does anything.
      aria-label={`Open ${path}${lineLabel} in the workspace file viewer`}
      title={`Open ${path}${lineLabel}`}
      data-testid={testId}
      data-path={path}
      className={cn(
        "inline items-baseline rounded border border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)] px-1.5 py-0.5 text-left align-baseline font-mono text-[0.875em] text-[var(--color-text-info)] underline decoration-dotted underline-offset-2 [overflow-wrap:anywhere] hover:decoration-solid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
        className,
      )}
    >
      {children ?? path}
    </button>
  );
}
