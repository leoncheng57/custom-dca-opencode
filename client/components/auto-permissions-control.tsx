import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Alert } from "../ds/alert.js";
import { api, type AutoPermissionStatus } from "../lib/api.js";

const POLL_MS = 3_000;

export function AutoPermissionsControl({ directory, testId }: { directory: string; testId: string }) {
  const [status, setStatus] = useState<AutoPermissionStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
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
      setStatus(await api.setAutoPermissions(directory, !status.enabled));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const enabled = status?.enabled ?? false;
  return (
    <div data-testid={testId}>
      <Alert variant={enabled ? "danger" : "info"} className="border border-current">
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <strong>Auto permissions: {status ? (enabled ? "ON" : "OFF") : "loading"}</strong>
                <p className="mt-1 text-xs">
                  This setting affects every session using this project directory and resets to off when the BFF restarts.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={!status || saving || !directory}
                onClick={() => void toggle()}
                className="min-h-10 rounded-md border border-current px-3 text-xs font-semibold disabled:opacity-50"
                data-testid={`${testId}-toggle`}
              >
                {saving ? "Updating..." : enabled ? "Turn off" : "Turn on"}
              </button>
            </div>
            {enabled && (
              <p className="mt-2 font-medium" data-testid={`${testId}-warning`}>
                Danger: every asked permission is approved once automatically, including arbitrary shell commands,
                external-directory access, and repeated requests from a doom loop.
              </p>
            )}
            {(status?.error || requestError) && (
              <p className="mt-2 font-medium" data-testid={`${testId}-error`}>
                Auto permissions error: {status?.error ?? requestError}
              </p>
            )}
          </div>
        </div>
      </Alert>
    </div>
  );
}
