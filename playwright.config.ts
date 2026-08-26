import { defineConfig } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { e2eStateFiles, prepareE2EStateFiles } from "./tests/e2e/state-files.js";

// e2e runs entirely against a MOCK OpenCode server (tests/e2e/mock-opencode.ts),
// so the suite needs no agent, no LLM spend and no network — it works the same
// on a laptop and in CI.
//
// Two servers are started: the mock on MOCK_PORT, and the real BFF + built SPA
// on PORT pointed at it. That means the tests exercise the production bundle
// and the real BFF code path, with only the agent itself faked.
const PORT = Number(process.env.PORT || 3410);
const MOCK_PORT = Number(process.env.MOCK_OPENCODE_PORT || 4599);
const PREVIEW_PORT = Number(process.env.MOCK_PREVIEW_PORT || 4600);
const DSH_CORDIS = `${process.cwd()}/tests/fixtures/dsh-readonly.yml`;
const DSH_CORDIS_SHA256 = createHash("sha256").update(readFileSync(DSH_CORDIS)).digest("hex");

// The BFF persists notification preferences, notification history, project pins,
// model pins and the instruction audit to JSON files named by the env vars
// below. Each one is scoped to THIS run and emptied before the BFF boots, so a
// second local run — or a sibling worktree running concurrently on its own
// ports — can neither read nor grow another run's state. MODEL_PINS_FILE and
// INSTRUCTION_AUDIT_FILE were already pid-scoped; the other three were fixed
// strings shared by every run on the machine, which is what made the
// notification badge test in smoke.ui.spec.ts order-dependent and let history
// grow without bound (issue #80). Do not "tidy" these back to constant paths.
// Cleanup is by name only, never by glob, because a sibling worktree may be
// mid-run in the same /tmp; see tests/e2e/state-files.ts.
//
// Playwright re-imports this config inside every worker process, and a worker
// has its own pid, so only the runner may touch the filesystem here.
const stateFiles =
  process.env.TEST_WORKER_INDEX === undefined
    ? prepareE2EStateFiles({ lane: PORT, runID: process.pid })
    : e2eStateFiles(process.pid);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `npx tsx tests/e2e/mock-opencode.ts ${MOCK_PORT}`,
      port: MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx tsx tests/e2e/mock-preview.ts ${PREVIEW_PORT}`,
      port: PREVIEW_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Test the built bundle, not the dev server — the predecessor had bugs
      // that only appeared after a production build.
      command: "npm run build && node dist/server/index.js",
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: String(PORT),
        OPENCODE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        PROJECTS_DIR: "/tmp",
        PROJECT_PINS_FILE: stateFiles.PROJECT_PINS_FILE,
        MODEL_PINS_FILE: stateFiles.MODEL_PINS_FILE,
        OPENCODE_WORKTREE_ROOT: "/tmp/custom-dca-opencode-e2e-worktrees",
        NOTIFICATION_PREFS_FILE: stateFiles.NOTIFICATION_PREFS_FILE,
        NOTIFICATION_HISTORY_FILE: stateFiles.NOTIFICATION_HISTORY_FILE,
        INSTRUCTION_AUDIT_FILE: stateFiles.INSTRUCTION_AUDIT_FILE,
        PREVIEW_ALLOWED_PORTS: String(PREVIEW_PORT),
        PUBLIC_APP_URL: "https://ide.e2e.example.test:8443",
        GITHUB_API_URL: `http://127.0.0.1:${PREVIEW_PORT}`,
        GITHUB_TOKEN: "e2e-planning-token",
        DSH_EXPERIMENT_ENABLED: "true",
        DSH_BRIDGE_SCRIPT: `${process.cwd()}/tests/e2e/mock-dsh-bridge.py`,
        DSH_PRESETS_JSON: JSON.stringify([{
          id: "e2e-readonly",
          label: "E2E read-only",
          provider: "fixture",
          model: "mock-dsh",
          mode: "read-only",
          cordis: DSH_CORDIS,
          sha256: DSH_CORDIS_SHA256,
        }]),
        DSH_WORKSPACES_JSON: JSON.stringify([{
          id: "dsh-e2e-workspace",
          label: "DSH E2E workspace",
          directory: process.cwd(),
        }]),
        DSH_EXPERIMENT_LEDGER: `/tmp/custom-dca-opencode-dsh-ledger-${PORT}.json`,
      },
    },
  ],
});
