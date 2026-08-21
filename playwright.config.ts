import { defineConfig } from "@playwright/test";

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
        PROJECT_PINS_FILE: "/tmp/custom-dca-opencode-e2e-project-pins.json",
        OPENCODE_WORKTREE_ROOT: "/tmp/custom-dca-opencode-e2e-worktrees",
        NOTIFICATION_PREFS_FILE: "/tmp/custom-dca-opencode-e2e-notifications.json",
        PREVIEW_ALLOWED_PORTS: String(PREVIEW_PORT),
        PUBLIC_APP_URL: "https://ide.e2e.example.test:8443",
        GITHUB_API_URL: `http://127.0.0.1:${PREVIEW_PORT}`,
      },
    },
  ],
});
