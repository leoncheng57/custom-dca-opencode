import { useState } from "react";

import { Button } from "../ds/button.js";
import type { NotificationRecord } from "../lib/api.js";

/**
 * Resolves only active rows loaded into the current filtered surface.
 *
 * The history API intentionally returns a bounded newest window, while the
 * badge is unwindowed. Calling this "Resolve all" without that qualifier would
 * claim to clear older rows it did not load, so the label names the exact scope.
 * This is still manual and reversible: every changed row stays available in
 * Resolved and can be individually reopened.
 */
export function ResolveShownNotifications({
  records,
  onResolve,
  onError,
  compact = false,
}: {
  records: NotificationRecord[];
  onResolve: (ids: string[]) => Promise<void>;
  onError: (error: Error) => void;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const ids = records.filter((record) => record.resolvedAt === undefined).map((record) => record.id);
  if (ids.length === 0) return null;

  const resolve = async () => {
    const noun = ids.length === 1 ? "notification" : "notifications";
    if (!window.confirm(`Resolve ${ids.length} loaded ${noun}? Older notifications outside this view are not changed.`)) return;
    setPending(true);
    try {
      await onResolve(ids);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="primary"
      className={compact ? "h-7 px-2 text-[11px]" : undefined}
      disabled={pending}
      onClick={() => void resolve()}
      data-testid="opencode-notification-resolve-shown"
    >
      {pending ? "Resolving..." : `Resolve all loaded (${ids.length})`}
    </Button>
  );
}
