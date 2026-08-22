import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Alert } from "../ds/alert.js";
import { api, type AutoPermissionStatus } from "../lib/api.js";

const POLL_MS = 3_000;

export function AutoPermissionsControl({ directory, testId }: { directory: string; testId: string }) {
  const [status, setStatus] = useState<AutoPermissionStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
    setShowDetails(false);
    setRequestError(null);
    if (!directory) return;
    let cancelled = false;
    const refresh = () => void api.autoPermissions(directory).then((next) => {
      if (!cancelled) {
        setStatus(next);
        setRequestError(null);
      }
    }).catch((error: Error) => {
      if (!cancelled) setRequestError(error.message);
    });
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [directory]);

  const toggle = async () => {
    if (!directory || !status || saving) return;
    setSaving(true);
    setRequestError(null);
    try {
      const next = await api.setAutoPermissions(directory, !status.enabled);
      setStatus(next);
      if (!next.enabled) setShowDetails(false);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const enabled = status?.enabled ?? false;
  return (
    <div data-testid={testId}>
      <Alert variant={enabled ? "danger" : "info"} className="border border-current px-3 py-2">
        <div className="flex min-h-5 items-center gap-2">
          <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          <strong className="min-w-0 flex-1 truncate text-xs sm:text-sm">
            Auto permissions: {status ? (enabled ? "ON" : "OFF") : "loading"}
          </strong>
          {enabled && <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((visible) => !visible)}
            className="shrink-0 text-xs font-medium underline underline-offset-2"
            data-testid={`${testId}-details`}
          >
            Details
          </button>}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={saving ? "Updating auto permissions" : `Turn auto permissions ${enabled ? "off" : "on"}`}
            aria-busy={saving}
            disabled={!status || saving || !directory}
            onClick={() => void toggle()}
            className={`relative h-5 w-9 shrink-0 rounded-full border border-current transition-colors disabled:opacity-50 ${enabled ? "bg-current" : "bg-transparent"}`}
            data-testid={`${testId}-toggle`}
          >
            <span
              aria-hidden="true"
              className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-[var(--color-background-surface)] transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
        </div>
        {enabled && showDetails && <p className="mt-2 text-xs font-medium" data-testid={`${testId}-warning`}>
          Danger: every asked permission is approved once automatically, including arbitrary shell commands,
          external-directory access, and repeated requests from a doom loop. This affects every session using
          this project directory and resets to off when the BFF restarts.
        </p>}
        {(status?.error || requestError) && (
          <p className="mt-2 text-xs font-medium" data-testid={`${testId}-error`}>
            Auto permissions error: {status?.error ?? requestError}
          </p>
        )}
      </Alert>
    </div>
  );
}
