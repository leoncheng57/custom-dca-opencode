import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";

import { Card, CardHeader, CardTitle, CardContent } from "./ds/card.js";
import { Badge } from "./ds/badge.js";
import { Alert } from "./ds/alert.js";
import "./styles.css";

interface HealthResponse {
  healthy: boolean;
  upstream: {
    url: string;
    reachable: boolean;
    version?: string;
    expected?: string;
    versionMatches?: boolean;
    error?: string;
  };
}

/**
 * Phase 0 landing page: proves the SPA builds, the BFF is reachable, and the
 * OpenCode server behind it is healthy. Replaced by the conversation Hub in
 * Phase 2.
 */
function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => res.json())
      .then((body: HealthResponse) => {
        if (!cancelled) setHealth(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="mx-auto flex max-w-2xl flex-col gap-4 p-6"
      data-testid="opencode-app-root"
    >
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">custom-dca-opencode</h1>
        <Badge variant="beta" data-testid="opencode-phase-badge">
          Phase 0
        </Badge>
      </header>

      <Card data-testid="opencode-health-card">
        <CardHeader>
          <CardTitle>Server</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="danger" data-testid="opencode-health-error">
              Could not reach the BFF: {error}
            </Alert>
          ) : !health ? (
            <p className="text-sm">Checking…</p>
          ) : (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt>Upstream</dt>
              <dd className="font-mono text-xs">{health.upstream.url}</dd>
              <dt>Reachable</dt>
              <dd data-testid="opencode-health-reachable">
                {health.upstream.reachable ? "yes" : "no"}
              </dd>
              {health.upstream.version ? (
                <>
                  <dt>Version</dt>
                  <dd className="font-mono text-xs" data-testid="opencode-health-version">
                    {health.upstream.version}
                    {health.upstream.versionMatches === false
                      ? ` (expected ${health.upstream.expected})`
                      : ""}
                  </dd>
                </>
              ) : null}
            </dl>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
