import { defineConfig } from "@playwright/test";

import base, { appServer, baseUse, mockOpenCodeServer, mockPreviewServer } from "./playwright.config.js";

// Isolated E2E profile — only ever loaded INSIDE the disposable container built
// by Dockerfile.e2e (issue #204). It is a thin override of playwright.config.ts
// so the mock wiring and the BFF env block have exactly one definition.
//
// Three deliberate differences from the host profile:
//
// 1. Every output path is absolute under /artifacts. Playwright's defaults are
//    checkout-relative (`test-results/`, `playwright-report/`), which inside the
//    container would land in /workspace and never be exported. The launcher
//    copies /artifacts out of the STOPPED container with `docker cp`, so the
//    tree has to be a real directory in the container's own layer.
//
// 2. `reuseExistingServer` is forced false rather than inherited from CI. The
//    container is fresh, so there is nothing legitimate to reuse — and a silent
//    attach to a stale process is the exact failure mode this whole lane exists
//    to remove. Setting it explicitly means the profile does not depend on
//    whoever remembered to export CI.
//
// 3. The BFF command drops `npm run build`. Dockerfile.e2e already built
//    dist/ during the image build, where a compile error is a visible build
//    failure instead of a 120s webServer timeout.
//
// Ports and /tmp fixture paths are intentionally UNCHANGED. Container
// namespaces make the fixed values private per run, which is why this lane
// needed no migration of the ~19 specs that hardcode /tmp/mock-project.

const ARTIFACTS = process.env.E2E_ARTIFACT_ROOT || "/artifacts";

/** Force a fresh service; see note 2 above. */
function fresh<T extends { reuseExistingServer?: boolean }>(server: T): T {
  return { ...server, reuseExistingServer: false };
}

export default defineConfig({
  ...base,
  testDir: "tests/e2e",
  // Traces, failure screenshots and per-test output.
  outputDir: `${ARTIFACTS}/test-results`,
  reporter: [
    ["html", { open: "never", outputFolder: `${ARTIFACTS}/playwright-report` }],
    ["json", { outputFile: `${ARTIFACTS}/logs/results.json` }],
    ["list"],
  ],
  use: { ...baseUse },
  webServer: [
    fresh(mockOpenCodeServer),
    fresh(mockPreviewServer),
    { ...fresh(appServer), command: "node dist/server/index.js" },
  ],
});
