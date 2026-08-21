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
  than the 1.18.19 server and its event union is stale, so `server/opencode/client.ts`
  owns a small typed fetch seam instead of casting around the SDK.
- Tests: `npm test` (vitest, `tests/*.test.ts`, node environment, import with `.js`
  suffixes). `npm run typecheck` runs both tsconfigs. Playwright starts deterministic
  mock OpenCode and preview servers, so `npm run test:e2e` needs no live stack or keys.
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
| `Todo` has **no `id`** in 1.18.19 | Key task-list rows by index/content |
| Permission precedence is **LAST-match-wins** | Put `"*"` first, specifics after — the opposite of most ACLs |
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
   "running" state — the `session` table has no status column, and `/api/session/active`
   is explicitly scoped to the owning process. A crash mid-turn kills the run silently.
   We do **not** auto-re-prompt (that can replay destructive work). Instead the UI flags
   a session as interrupted when it is absent from `GET /session/status` **and** its last
   message is an assistant turn with no `time.completed`, and offers a Resume that
   **prefills the composer** rather than auto-sending.
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
9. **Plan/Build is enforced per prompt on the classic API.** Build sends the native
   `build` agent normally. Plan sends the native `plan` agent plus a BFF-generated,
   deny-by-default tool map because project permissions can override agent denials
   under last-match-wins precedence. This is deterministic read-only mode, not an
   OpenHands-style per-action risk score.

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
