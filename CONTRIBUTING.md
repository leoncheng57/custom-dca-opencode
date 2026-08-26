# Contributing

Thank you for improving custom-dca-opencode. This guide covers the repository's
development workflow and the checks that pull requests must pass.

Use the self-contained [visual reading index](docs/contributing/index.html) to choose a
contributor pathway, open `/docs` in the running app for the architecture-focused docs center,
or continue here for the canonical workflow.

## Before you start

You need:

- Node.js 22 or newer
- npm
- A local OpenCode server at the version pinned in
  [`server/opencode/client.ts`](server/opencode/client.ts) for interactive development

The application runs directly on the host. It does not use Docker, and the development
script does not start OpenCode for you.

## Set up the repository

Install the locked dependencies and create a local environment file:

```bash
npm install
cp .env.example .env
```

Review [`.env.example`](.env.example) before starting the app. At minimum,
`OPENCODE_URL` must point to a reachable OpenCode server. `PROJECTS_DIR` and
`OPENCODE_WORKTREE_ROOT` define the only roots from which the BFF accepts workspace
paths.

Start the BFF and Vite development server together:

```bash
npm run dev
```

The script checks OpenCode's `/global/health` endpoint and verifies that the BFF port is
available before starting either watcher. By default, OpenCode uses port 4096, the BFF
uses port 3000, and Vite uses port 5173. You can also run the watchers separately with
`npm run dev:server` and `npm run dev:ui`.

For deployment and macOS LaunchAgent instructions, see
[`deploy/README.md`](deploy/README.md). Those commands are not required for ordinary
development.

## Understand the boundaries

The request path is:

```text
Browser -> React/Vite SPA -> Express BFF -> opencode serve
```

See [docs/architecture.md](docs/architecture.md) for the detailed request and event flows,
state ownership, safety boundaries, and extension map.

- [`client/`](client/) contains the React SPA and design-system primitives.
- [`server/`](server/) contains API routes, credentials, directory validation, SSE
  fan-out, local git operations, notifications, and forge integrations.
- [`server/opencode/client.ts`](server/opencode/client.ts) is the typed fetch boundary for
  the OpenCode API. Treat the live OpenCode `/doc` response as the contract when that
  API changes.
- [`client/lib/events.ts`](client/lib/events.ts) maps raw OpenCode parts to the
  backend-neutral transcript model. Transcript rows should not consume raw OpenCode
  `Part` objects.
- [`tests/`](tests/) contains Vitest tests and fixtures.
- [`tests/e2e/`](tests/e2e/) contains Playwright tests and deterministic mock servers.

Keep browser-facing requests same-origin through the BFF. Do not expose OpenCode or
third-party credentials to the client. Preserve directory canonicalization and preview
proxy restrictions when changing routes that touch the host filesystem or local
services.

## Follow repository conventions

- Keep TypeScript strict and match the surrounding module style.
- Use `.js` suffixes when tests import TypeScript modules, as required by the ESM build.
- Keep reusable primitives in [`client/ds/`](client/ds/) based on `forwardRef`, `cn()`,
  and semantic `var(--color-*)` tokens. Do not add raw color values.
- Add a `data-testid` to every interactive element so deterministic UI tests can target
  it.
- Keep every root theme token paired with a dark-mode value.
- Tolerate unknown OpenCode event types. The global event stream includes events outside
  the local typed union.
- Use the asynchronous prompt path for UI requests; the blocking message endpoint holds
  the connection for the full agent turn.
- Avoid new runtime dependencies unless the change genuinely requires one and its reason
  is recorded in [`AGENTS.md`](AGENTS.md).

There is no configured formatter or linter. Keep edits focused and follow the formatting
already used in the file you change.

## Add and run tests

Add focused tests with behavior changes:

- Vitest discovers `tests/**/*.test.ts` and runs in a Node environment.
- Playwright exercises the built SPA and real BFF against the mock OpenCode and preview
  servers in [`tests/e2e/`](tests/e2e/).
- End-to-end tests do not need a live agent, model credentials, or network access.

Run the same functional checks used by CI:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` builds the production bundle automatically. A first local Playwright
run may require the Chromium binary:

```bash
npx playwright install chromium
```

CI installs Chromium with its operating-system dependencies before running the suite.
Failed CI runs upload the Playwright report as an artifact.

## Prepare a pull request

Before opening a pull request:

1. Rebase or merge the latest `main` without force-pushing shared work.
2. Review `git diff` and `git status` for unrelated files and secrets.
3. Run the typecheck, unit tests, build, and end-to-end tests listed above.
4. Explain the behavior changed and list the verification performed.

Pull requests run the full verification sequence and a full-history Gitleaks scan. Do
not commit `.env`, credentials, local state, generated build output, Playwright reports,
or screenshot output.

Every same-repository pull request also receives a credential-free interactive simulator
that refreshes on each commit. See [Pull request previews](docs/pr-previews.md) for the
deployment flow, diagrams, BFF stub contract, trust boundaries, and troubleshooting.

### Request deterministic UI screenshots

For a UI change, add one fenced `screenshots` block to the pull request body with one
root-relative route per line:

````markdown
```screenshots
/?directory=/tmp/mock-project
full:/sessions/ses_mock_done?directory=/tmp/mock-project
```
````

The workflow accepts up to ten known application routes and captures dark-mode desktop
and mobile images against deterministic mocks. Prefix a route with `full:` to capture
its full scroll height. Reproduce the fixture request locally with:

```bash
npm run screenshots:local
```

Output is written to the ignored `screenshot-output/` directory. See the
[`README.md`](README.md#pr-screenshots) for route validation, fork, publication, and
troubleshooting details.

## Security-sensitive changes

OpenCode tools execute on the host as the current user. Changes involving permissions,
workspace paths, credentials, the preview proxy, session sharing, or workflow privileges
need explicit tests for their security boundaries. Keep broad permission rules before
specific overrides because OpenCode permission matching is last-match-wins.

Report a suspected vulnerability privately to the repository owner rather than opening
a public issue with exploit details.
