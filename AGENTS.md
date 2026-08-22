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
- **Playwright runs spec _files_ in parallel against one BFF _and one mock_.** Tests
  inside a file are serial; files are not, and `test.describe.serial` orders only the
  file it is written in. So any state that is not per-request — BFF memory *or* the mock
  server's fixture objects — is shared across files, and a spec that both mutates and
  asserts it must own its key. Two flavours have shipped: auto permissions
  (directory-scoped BFF memory) and the mock's `/test/*/reset` endpoints, where
  `sharing/reset` deleted `share` from every session in every directory, so
  share-export.ui revoked the URL smoke.api was mid-assertion on. Hence: **a reset must
  only clear what its caller named**, and no two files may name the same key — mock
  directory, question scope or share-fixture session. `tests/e2e-shared-state-ownership.test.ts`
  fails the build otherwise. This class of bug passes in isolation and fails somewhere
  else on each full run, so it is diagnosed from the rule, not from a repro.
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
| A **background** task part flips to `completed` when the *launch call* returns | Never read it as "the child finished"; only a synchronous task part proves that |
| A background child reports back as a **user-role** message in the parent | Detect and re-render it, or it appears as a prompt the human never typed |
| There is **no durable background-job list** | Derive child state per request; `/session/status` is process-local, so absence ≠ idle |
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
9. **Plan/Build is activated on the session before each classic prompt.** Issue #15
   established that legacy `tools` overrides are converted into persistent session
   permission rules, so omitting `tools` on the next Build prompt does not restore
   write access. Plan now appends denies for discovered mutating tools while leaving
   `task` governed by the resolved Plan agent's pattern-specific permissions, so safe
   read-only delegation remains available without allowing unsafe agents. Build projects
   the resolved Build agent's wildcard and tool-specific rules onto discovered tools.
   Neither mode appends an unconditional task allow; this preserves configured asks and
   pattern-specific denies under OpenCode's last-match-wins semantics.
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
    intentionally absent because the BFF cannot see them. Every unresolved record the user
    was actually pinged about is retained, plus the newest 500 in each capped category
    (resolved, and unresolved-but-suppressed). There is no bulk clear because resolved
    history is the evidence this feature exists to preserve. Persisted v1 resolution reasons
    remain readable, but all new resolution writes use `resolvedBy: "checked"`.
10a. **Suppressed records are a bounded audit trail, and the noise filters are
    server-side.** `delivery.suppressed` (`"auto-permissions" | "subagent"`) marks the two
    categories that are recorded but never delivered. They exist so "why was I never
    asked?" and "did my delegated child ever finish?" stay answerable — sub-agent events
    used to be dropped at ingest, which made the second question unanswerable — but they
    are noise in an inbox, so the UI hides both by **default** behind checkboxes rather
    than excluding them in code. Because they were never delivered they are not a
    checklist, so unlike delivered unresolved records they are capped by `prune()`; a busy
    auto-permissions project would otherwise grow the log without limit. The filters are
    applied in `HistoryStore.list()` **and** `activeCount()` together and driven by query
    flags, because a badge counting rows the user asked not to see just relocates the
    clutter. An absent flag means no filtering, so existing API consumers are unaffected.
    `suppressedActive` reports each category's unresolved total whether or not its filter
    is on, so a checkbox states its own cost.
10b. **Records snapshot the session title; they never resolve it on read.**
    `sessionTitle` is written at append time from titles the service already saw on
    `session.created`/`session.updated` or its parent/child lookups — it never issues a
    request of its own, and omits the field rather than inventing a placeholder. Sessions
    get renamed and deleted, so resolving later would misattribute or lose the record.
11. **Auto permissions is volatile and directory-scoped.** The BFF keeps it in memory,
    defaults it off after every restart, and replies `once` to `permission.asked` for
    every session in an enabled directory. It never mutates policy, replies `always`,
    or answers questions; it can only approve requests that upstream emits as asked.
    It does not change the Plan/Build session-policy activation above. Permission and
    parked-permission notifications are recorded with `suppressed: "auto-permissions"`
    while enabled — never delivered, and hidden from the inbox and the badge by the
    default filter — because those asks were answered before the user saw them.
12. **Recents are cross-project; they are the one non-directory-scoped route.**
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
13. **Sub-agent state is derived, and `unknown` is a first-class answer.**
    OpenCode has child sessions but no durable background-job API, so
    `server/opencode/subagents.ts` combines four upstream facts —
    `/session/{id}/children`, the parent's task parts, `/session/status`, and the
    child's own transcript — into one ledger keyed by **child session id**, never by
    task-part id (resume emits several parts per child). Precedence is fixed:
    observed busy, then the child's own final turn, then a hand-back notice in the
    parent, then the delegating task part. A **background** task part that reports
    `completed` means only that the launch call returned, so it is never read as a
    finished child; a **synchronous** one blocked on the child and is. When nothing
    settles it — a cancelled child, or an agent server that restarted mid-run — the
    row is `unknown` and names what was checked. Three cancelled children were
    observed in the audit with no parent notification at all, so guessing here would
    print a confident falsehood. Cost is bounded: the newest parent page for intent,
    and child transcripts probed only for children that are neither running nor
    already settled, newest first, capped and concurrency-limited, with `truncated`
    reported rather than silently implied.
    OpenCode defaults `subagent_depth` to 1, which prevents nested delegation; this
    repository sets it to 3. The Settings page displays the global value read-only,
    while project-level authoring remains in `opencode.json`.
14. **A hand-back notice is identified by the child session id it names.**
    Background children report completion by injecting a *user-role* message into
    the parent, and nothing upstream marks it as machine-authored — left alone it
    renders as a chat bubble the human never typed. Both detectors require an
    outcome word *and* a child session id (the server additionally requires the id
    to be a known child; the client also requires a delegation word, since it
    cannot know the child set). A message that merely mentions an id settles
    nothing and is ignored: a spurious "completed" is the expensive direction to be
    wrong in. If upstream ever adds an explicit synthetic flag, prefer it and keep
    this as the fallback.
15. **Delegation controls only promise what the connected process can deliver.**
    Stop appears solely for children `/session/status` reports busy, because abort
    authority is process-local; background promotion is gated on
    `/experimental/capabilities`, never on an environment variable the BFF cannot
    read. Child endpoints verify the parent link before acting — upstream will abort
    any id, so `/sessions/{parent}/subagents/{child}/abort` would otherwise be a
    general-purpose abort endpoint wearing a sub-agent costume.
16. **Per-message Plan/Build provenance is classified from that message alone,
    and is provenance rather than policy.**
    A session switches modes, so the session's *current* mode says nothing about a
    row already on screen, and pagination can drop the prompt that set it — which
    rules out inheriting mode from a neighbour, a parent, or the session. Raw
    metadata is inconsistent: user messages name the primary agent in `info.agent`,
    some assistant messages carry `info.mode` and others only `info.agent`. For an
    assistant turn `info.mode` is primary and `info.agent` is only a fallback, so a
    recognized mode classifies the row even when the agent naming it is internal or
    a sub-agent (`compaction`, `explore`, anything added later); those identities go
    neutral only when nothing else classifies them. An unrecognized `info.mode` is
    an unknown *label*, says nothing about authorship, and falls through to the
    identity. Recognized values that disagree yield nothing. The live 1.18.21
    capture in `tests/fixtures` only ever pairs `info.mode` with an agreeing
    `info.agent`, so this ordering is a forward-compatibility choice rather than an
    observed behaviour. Consequence to accept: a Build pill never proves the turn
    could mutate anything — per #75 a child can report Build while retaining a
    parent's historical Plan denies. "What could this turn do?" belongs on the
    sub-agent ledger, not here. Only user and assistant prose is marked; thoughts,
    tools, task cards, separators and errors share the message id but are
    operational detail, and marking them costs more legibility than the provenance
    is worth. The treatment is an accent rail plus a text pill and deliberately no
    body tint: markdown already uses surface fills for code blocks and tables, and
    a wash underneath them flattens that hierarchy. Mode is part of the prose
    reconciliation fingerprints, so a row first seen without metadata is replaced —
    not frozen neutral — when an authoritative fetch classifies it.
17. **Project Planning is one fixed, read-only repository feed.** `/planning` is
    about improving this application, not whichever project directory is currently
    selected, so the BFF hard-codes `leoncheng57/custom-dca-opencode` and accepts no
    repository or directory from the browser. GitHub issues and pull requests share
    one list and retain their type, state, labels, creation time and last-activity
    time. Label colors are deliberately dropped: GitHub supplies arbitrary hex while
    client primitives require semantic tokens, and the label name already carries
    the meaning. REST pagination is bounded at 500 records and reports `truncated`
    explicitly rather than silently implying the feed is complete.

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
