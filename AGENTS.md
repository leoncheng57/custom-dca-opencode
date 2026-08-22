# Repo memory for agents

A custom local coding-agent IDE built on the **OpenCode server API**. React/Vite SPA
(`client/`) + Express BFF (`server/`) talking to a long-lived `opencode serve` over
HTTP + SSE. Successor to `custom-dca-ide-with-openhands`, which is frozen.

## Architecture in one line

```
Browser (desktop or phone via Tailscale) → client/ SPA → server/ BFF → opencode serve :4096
```

There is **no container**. `opencode serve` is a single Bun binary running on the host
as your user. This is the biggest difference from the OpenHands runner and it shapes
several decisions below.

## Key facts

- **One server, all projects.** Nearly every instance-scoped route takes
  `?directory=<abs path>` and that is the project selector. Verified live: 32 projects
  / 2,483 sessions on one instance. `server/opencode/client.ts` owns this.
- **The API is much larger than the docs.** `GET /doc` on a live server returns
  OpenAPI 3.1 with 162 paths / 188 operations; the published docs show ~60. When in
  doubt, curl `/doc`, not the website.
- **The live `GET /doc` is the contract.** The SDK's classic query types are narrower
  than the 1.18.21 server and its event union is stale, so `server/opencode/client.ts`
  owns a small typed fetch seam instead of casting around the SDK.
- Tests: `npm test` (vitest, `tests/*.test.ts`, node environment, import with `.js`
  suffixes). `npm run typecheck` runs the client, server, and screenshot-tool tsconfigs.
  Playwright starts deterministic mock OpenCode and preview servers, so
  `npm run test:e2e` needs no live stack or keys.
- PR screenshot requests are routes inside one fenced `screenshots` block in the PR
  body; the exact schema and local command are in README. Capture is an
  unprivileged fork-safe workflow. Only the default-branch publisher may validate
  its artifact, write `gh-pages`, or update the marker-owned bot comment. Never run
  artifact code or publish files not declared by its validated manifest.
- `reminders/<id>/SKILL.md` is read at runtime, not emitted by `tsc`. Keep the root
  catalogue beside `dist/` in deployments. Per-message injection accepts an ID only;
  the BFF resolves the body and appends the `<reminder name="id">` sentinel.

## Non-obvious API contracts (each one cost real debugging)

| Trap | Rule |
|---|---|
| `POST /session/{id}/message` **blocks for the entire agent turn** | Always use `POST /session/{id}/prompt_async` (returns 204) from a UI path |
| `GET /event` is **directory-scoped** | Subscribe to `GET /global/event` for a multi-project UI; demux on the `directory` field |
| `server.heartbeat` fires every 10s and is **absent from the typed event union** | Event reducers must tolerate unknown `type` values, never throw |
| `GET /file/status` returns `[]` unconditionally (binary stub) | Use `GET /vcs/status` |
| `GET /find/symbol` returns `[]` unconditionally | No symbol search; don't build on it |
| `GET /find` silently caps at 10 results | Narrow the query or shell out |
| No git commit/log/blame route exists anywhere | Run `git log` locally in the BFF |
| `Todo` has **no `id`** in 1.18.21 | Key task-list rows by index/content |
| Permission precedence is **LAST-match-wins** | Put `"*"` first, specifics after — the opposite of most ACLs |
| Non-empty legacy `prompt_async.tools` entries persist on the session | Never enforce Plan with `tools`; activate mode with append-only session rules before prompting, and restore Build from the resolved `/agent` policy |
| `PATCH /session/{id}` appends `permission` rules | Compare the current suffix before patching so repeated same-mode prompts do not grow the ruleset |
| Mode policy and `prompt_async` are one critical section | Serialize them process-locally by directory + session so concurrent opposite-mode prompts cannot run under each other's policy |
| Classic SSE has no replay cursor | Refetch state on reconnect |

## Decisions

1. **Path B — custom UI on `opencode serve`.** Considered and declined: a plugins+cmux
   composition (cmux sidebars cannot render input controls, so a settings page is
   impossible there), and adopting OpenChamber. Research: `docs/research/`.
2. **No Docker.** The OpenHands runner needed `agent-canvas` (agent runtime) and
   Postgres (manager runs). Manager runs are dropped, so Postgres goes too. One
   process to supervise. This also removes the fixed-port constraint that limited the
   old repo to one running worktree at a time.
3. **Permissions replace the container boundary.** See `opencode.json`. Honest framing:
   opencode TUI sessions already ran host-side on this machine (some with `--auto`),
   so this makes an existing posture deliberate rather than adding new risk.
4. **Host git identity.** No bot-identity `shell.env` plugin. Agent commits and PRs use
   whatever credentials the host has. The old `OPENHANDS_GIT_TOKEN` / `OPENHANDS_GITHUB_TOKEN`
   split retires with the container.
5. **R2 (no auto-resume) is an accepted risk, detection-only.** OpenCode never persists
   "running" state — the `session` table has no status column, and `/session/status`
   is explicitly scoped to the owning process. Separate TUI and serve processes can
   share the same DB, so an absent status is not proof of idle. The BFF keeps only
   process-lifetime ownership evidence for sessions it creates, prompts, or observes
   busy on its connected server. Pre-existing sessions are shown as status unavailable,
   do not get an interrupted banner, and require explicit confirmation before prompting.
   Stop is offered only for work currently reported by the connected server. For known
   owned sessions that become idle, an incomplete last turn still gets the manual Resume
   affordance; it **prefills the composer** rather than auto-sending.
6. **Classic API surface only.** `/api/**` (v2) is newer, event-sourced and 401-gated;
   everything needed exists on the classic surface. Revisit if we want replayable
   per-session streams (`/api/session/{id}/event?after=`).
7. **Mobile is first-class.** Responsive below `lg`, PWA manifest, reachable over
   Tailscale. This is why the preview reverse proxy survived descoping (see #8) — from a
   phone there is no cmux pane to fall back on.
8. **Descoped from the OpenHands feature set**, because each only existed to reach
   *inside* the container, or is better served by tools already open:
   - Preview **lifecycle** (start/stop/logs/status) — dropped; the **reverse proxy** is
     kept for mobile.
   - Terminal page — dropped; the Commands panel (derived from the transcript, with
     `.sh` export) covers the read case.
   - Web PTY, disk usage bar, providers/models settings page — dropped.
   - Manager runs — dropped; the `manager-children` cmux skill covers it.
   - MCP/LSP **latency probes** — dropped; `GET /mcp` already reports
     `failed{error}` / `needs_auth`, which is the diagnostic that mattered.
   - Permissions **editor** — downgraded to a read-only display of effective rules.
     Authoring happens in `opencode.jsonc`, which has `$schema` autocomplete.
   - Skills toggles, condenser settings — no OpenCode equivalent; dropped.
9. **Plan/Build is activated on the session before each classic prompt.** Issue #15
   established that legacy `tools` overrides are converted into persistent session
   permission rules, so omitting `tools` on the next Build prompt does not restore
   write access. Plan now appends denies for discovered non-read tools; Build projects
   the resolved Build agent's wildcard and tool-specific rules onto discovered tools.
   This preserves configured asks and pattern-specific denies without blanket allows.
   Activation must succeed before `prompt_async`, and exact suffix checks make repeated
   same-mode prompts idempotent.
10. **Notification resolution is manual-only and server-persisted.**
    `.state/notification-history.json` (`NOTIFICATION_HISTORY_FILE`) is
    written by `NotificationService`, which previously discarded everything it sent. Every
    notification kind starts unresolved and contributes to the current-directory red
    counter. Upstream permission/question replies never resolve notification records; only
    the user's reversible **Resolved** checkbox may change that state. Suppressed and failed deliveries are
    still recorded — the log's job is to explain a missing ping. `delivery.desktop` is the
    server-backed desktop preference, never proof of render; device-local sound/speech are
    intentionally absent because the BFF cannot see them. All unresolved records are
    retained plus the newest 500 resolved records. There is no bulk clear because resolved
    history is the evidence this feature exists to preserve. Persisted v1 resolution reasons
    remain readable, but all new resolution writes use `resolvedBy: "checked"`.
11. **Auto permissions is volatile and directory-scoped.** The BFF keeps it in memory,
    defaults it off after every restart, and replies `once` to `permission.asked` for
    every session in an enabled directory. It never mutates policy, replies `always`,
    or answers questions; it can only approve requests that upstream emits as asked.
    It does not change the Plan/Build session-policy activation above. Permission and
    parked-permission notifications are suppressed while enabled because asked requests
    are handled immediately.
11. **Recents are cross-project; they are the one non-directory-scoped route.**
    The Hub shows recent work before a project is chosen, so `GET /api/recent-sessions`
    takes a *set* of directories instead of `?directory=`. There is no global session
    list upstream — `/session` is directory-scoped — so this is a capped, concurrency-
    limited fan-out (`listSessionsAcross`) whose per-directory failures are swallowed:
    one renamed project must not blank a panel that is mostly about other projects.
    The candidate set is shared pins plus the browser's own history, **not** every
    discovered project, because discovery is capped at 500 directories and each costs
    two upstream calls. Consequence to accept or revisit: a project that is neither
    pinned nor previously opened in this browser stays invisible. Recents poll on
    their own 60s timer, not the 10s session poll. Invalid directories are dropped
    rather than rejected — localStorage outlives renames and moves between machines.

## Client conventions (inherited from the OpenHands runner, still enforced)

- `client/ds/` primitives are forwardRef + `cn()` + semantic `var(--color-*)` tokens
  only. **Never raw hex.**
- Every interactive element carries a `data-testid`.
- No new runtime dependencies without a reason recorded here.
- `qrcode-generator@2.0.4` is the sole QR runtime dependency: it creates the
  phone-transfer matrix entirely in the browser, avoiding URL disclosure to an
  external image service. The app reads its matrix API and renders a React SVG
  path rather than injecting the package's generated markup.
- The transcript renderer consumes a backend-neutral `TranscriptEvent`. Row components
  must never touch raw OpenCode `Part` shapes — that mapping lives in exactly one place
  (`client/lib/events.ts`), which is what made this migration a ~363-line adapter
  rewrite instead of a full rebuild. **Keep that seam.**

## Automated PR screenshots

Request deterministic screenshots with one root-relative route per line in the PR body:

````md
```screenshots
/?directory=/tmp/mock-project
full:/sessions/ses_mock_done?directory=/tmp/mock-project
```
````

Blank lines and lines beginning with `#` are ignored. Every route captures dark-mode
desktop (1280x800) and mobile (390x740) PNGs; `full:` captures the full page at both
widths. The sticky comment renders `Route`, `Desktop`, and `Mobile` columns. Requests are
limited to 10 known UI routes and reject whitespace, controls, schemes, hosts,
backslashes, malformed encoding, and path traversal.

The read-only `pull_request` workflow runs the production SPA and BFF against only the
fixed Playwright OpenCode and forge mocks. A separate default-branch `workflow_run`
publisher treats the artifact as untrusted, validates its manifest and PNGs, writes only
`gh-pages:pr-screenshots/pr-<number>/`, and maintains one `<!-- pr-screenshots -->`
comment with public raw links and an artifact fallback. The close workflow uses
`pull_request_target` only for trusted GitHub API cleanup; it never checks out or runs PR
code. The publisher also requires the PR head repository to equal this repository and
binds the artifact to the workflow run SHA. Fork artifacts may be linked but their bytes
are never published. Never combine write permissions with execution of a fork checkout.

Fork capture is safe but may require a maintainer to approve the read-only Actions run.
If Actions are unavailable, capture locally and attach images manually. Local capture:

```bash
npm run screenshots:local
```

Output is written to the ignored `screenshot-output/` directory.
