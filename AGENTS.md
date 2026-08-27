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
  than the 1.18.22 server and its event union is stale, so `server/opencode/client.ts`
  owns a small typed fetch seam instead of casting around the SDK.
- Tests: `npm test` (vitest, `tests/*.test.ts`, node environment, import with `.js`
  suffixes). `npm run typecheck` runs the client, server, and screenshot-tool tsconfigs.
  Note it covers `client/`, `server/` and `scripts/` — **no tsconfig includes
  `tests/*.test.ts`**, so a test file is checked only by vitest at run time.
  Playwright starts deterministic mock OpenCode and preview servers, so
  `npm run test:e2e` needs no live stack or keys. `npm run test:e2e:docker` runs the
  same suite inside a disposable container (decision 27); `npm run test:e2e:host` is
  the explicit host lane; `npm run test:contract:host` is the host-only contract lane.
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
- `agent-skills/` holds portable skill, command, and simulation Markdown migrated from
  `leoncheng57/agent-skills`; it is content, not a second app. The Runner renders it
  natively under `/playbooks`. This remains separate from runtime reminders and the
  installed-skill `/api/catalog`, which reports what the connected OpenCode loaded.

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
2. **No Docker in the application runtime.** The OpenHands runner needed `agent-canvas`
   (agent runtime) and Postgres (manager runs). Manager runs are dropped, so Postgres
   goes too. One process to supervise. This also removes the fixed-port constraint that
   limited the old repo to one running worktree at a time. Scope note: decision 27 adds
   an *optional test-only* container. Nothing needed to run, develop or deploy the app
   requires Docker, and no agent session ever executes inside one.
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
    than excluding them in code. One child event is exempt from the subagent category:
    a **permission ask** takes the delivery path regardless of lineage, because a child
    stopped on an unanswered ask is stalled work nobody else can unblock, and suppressing
    it meant a delegated task sat frozen while the inbox swore nothing needed anyone. Its
    parked escalation follows the same policy. A child ask in an auto-approved directory
    is still suppressed — as `auto-permissions`, since it was answered before anyone was
    blocked. A child that merely finishes stays recorded-only: it hands back to its
    parent, so telling the human is noise. Because they were never delivered they are not a
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
11. **Auto permissions is directory-scoped and persisted.** The BFF replies `once` to
    `permission.asked` for every session in an enabled directory. It never mutates
    policy, replies `always`, or answers questions; it can only approve requests that
    upstream emits as asked. It does not change the Plan/Build session-policy activation
    above. Permission and parked-permission notifications are recorded with
    `suppressed: "auto-permissions"` while enabled — never delivered, and hidden from
    the inbox and the badge by the default filter — because those asks were answered
    before the user saw them. The enabled flags live in
    `.state/auto-approve.json` (`AUTO_APPROVE_STATE_FILE`, mode 0600) and are restored
    on boot: the flag was memory-only at first, which read as a safety default but had
    the opposite effect — every deploy silently flipped an auto-approved directory back
    to ask mode, and the next agent turn pushed one permission ask per tool call at
    every configured phone until the user noticed and re-toggled. Persisting an
    instruction the user already gave through the authenticated UI is not an
    escalation. A corrupt state file fails closed to everything-off; an explicit toggle
    always wins over the startup load; on restore the service reconciles pending asks,
    so requests that arrived while the BFF was down are answered too.
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
17. **Project Planning is one fixed repository feed and issue creator.** `/planning` is
    about improving this application, not whichever project directory is currently
    selected, so the BFF hard-codes `leoncheng57/custom-dca-opencode` and accepts no
    repository or directory from the browser. GitHub issues and pull requests share
    one list and retain their type, state, labels, creation time and last-activity
    time. Label colors are deliberately dropped: GitHub supplies arbitrary hex while
    client primitives require semantic tokens, and the label name already carries
    the meaning. REST pagination is bounded at 500 records and reports `truncated`
    explicitly rather than silently implying the feed is complete. Creation accepts
    only a bounded title, Markdown description and names from the bounded label
    catalogue, posts with the server-only `GITHUB_TOKEN`, and invalidates the read
    cache only after GitHub confirms the issue. A deep-linked item dialog reads a
    bounded 20,000-character description and the first 50 conversation comments,
    with each comment bounded at 8,000 characters; externally-authored Markdown is
    always rendered as untrusted. The same fixed-repository seam replaces labels on
    issues and pull requests only after validating them against a complete repository
    label catalogue, preserves up to 100 existing labels and refuses replacement
    when the upstream item exceeds that bound, permits at most one recognized
    priority label, and updates the grouped browser snapshot only after GitHub
    succeeds. The browser still cannot select a repository or project directory.
17a. **Planning is a priority-first queue with deterministic ownership.** Exact,
    case-insensitive `priority:high`, `priority:medium`, and `priority:low` labels
    select the outer section; items with multiple distinct priority labels appear
    only in an expanded `Needs triage` section rather than being silently promoted
    or demoted. Within a priority section, the alphabetically first non-priority
    label owns the item and `Untagged` sorts last, while every label remains visible
    on the row. High priority and conflicts open by default; lower queues collapse
    so a large backlog does not obscure current work. Five row-density treatments
    are a device-local display preference in `localStorage`, not repository planning
    data; the densest treatment is the first-visit default, and row labels share the
    status line rather than consuming another vertical band.
17b. **Planning epic hierarchy is bounded, read-only and device-local.** GitHub's
    issue list exposes child counts but not parent links, so the BFF fans out only
    across a bounded, concurrency-limited set of candidate parents and applies
    results afterward in deterministic parent order. The UI promotes an epic to
    the highest priority found on its parent or visible children, nests children
    only beneath that parent, and shows closed children as progress evidence. It
    never edits hierarchy. Expanded epic numbers persist in localStorage and
    malformed or blocked storage falls back to all epics collapsed. If filtering
    removes a parent while retaining its child, the child remains top-level with
    a parent breadcrumb rather than disappearing; unresolved or truncated edges
    are reported honestly instead of blanking the feed.
18. **PWA push supplements rather than replaces ntfy.** Web Push is a third independent
    delivery channel with its own server-backed enabled flag and event matrix. Device
    subscriptions are persisted server-side with mode `0600`; VAPID private material is
    environment-only. The service worker handles push, notification clicks, and explicit
    user-approved updates only: it has no `fetch` handler and caches no application or
    agent data. Expired subscriptions are removed after provider `404`/`410` responses.
    `web-push` is the runtime dependency because standards-compliant payload encryption,
    VAPID signing, and browser push-service requests are cryptographic protocol work that
    should not be reimplemented locally.
    Installed-PWA app badges use the global unresolved count across every project, excluding
    auto-permission and sub-agent records because those categories were never delivered.
    Every push snapshots that authoritative global count; opening the app and resolving or
    reopening a record resynchronizes it. A change made on another device therefore reaches
    the phone on its next push or app open, not through a separate badge-only background job.
19. **Human-managed children are a separate privilege lane from native tasks.** Native `task`
    delegation remains agent-initiated and keeps OpenCode's parent-session deny ceiling, task
    parts, depth accounting and hand-back. The sub-agent panel's **Launch child** action is an
    explicit human authorization: the BFF resolves a Plan/Build policy and validated model,
    creates a child with `parentID`, metadata and an exact creation-time ruleset, rereads the
    session to verify every security-relevant field, then submits directly to that child. The
    browser never authors raw rules, and this route must never be registered as an agent tool.
    Managed children appear in the normal hierarchy but create no parent task part or synthetic
    hand-back; their lifecycle is derived from their own status/transcript and may remain
    `unknown`. They are also **visually distinct** from native tasks wherever both appear (#182):
    the sub-agent row carries an info accent, a `Managed Child` badge beside its title and a stable
    `data-origin`, and the Hub pill and child-transcript badge say `Managed Child` rather than the
    neutral `sub`. The label is driven by the server-derived `origin`, never by the absence of a
    task part — a child with neither validated managed metadata nor a launch stays unlabelled,
    because relabelling an `unknown` child as either lane would print a confident falsehood about
    who authorized it.
    The child's persisted **title** is derived metadata and is redacted with the audit log's
    `redactInstructionText` **before** the first line is taken and before the 80-char cap; cutting
    first leaves an unmatchable token prefix in the title. The title is the widest leak surface
    derived from an assignment — it is copied into session summaries, sub-agent rows, Hub titles,
    breadcrumbs and persisted notification history — so it is redacted at the source rather than at
    render time in five places. The **submitted prompt and the child transcript are never
    redacted**: the child must receive the exact text its human wrote. Consequence to state
    plainly: this mitigates credential *shapes* in derived metadata and is not a safe channel for
    secrets, because the assignment retains them verbatim. Live 1.18.22 probes confirmed direct creation and also confirmed #75's asymmetry:
    native derivation copies a historical parent deny but discards its later Build allow. The
    resolved Plan agent alone is not read-only after project policy merges, so session-level Plan
    enforcement remains required.
    #75's asymmetry is **not** fixed upstream. anomalyco/opencode#45064 (drop a copied deny when
    a later rule supersedes it for the exact permission+pattern) was **closed unmerged** on
    2026-08-26, and `upstream/dev` still ships the stale-deny filter in
    `packages/opencode/src/agent/subagent-permissions.ts`. The patch exists only in this fork, so
    the pin is **indefinite, not a wait for an upstream release**: there is nothing pending to
    bump to, and every rebuild must re-apply it. Returning the plist to
    `.state/launchd/ai.opencode.serve.plist.bak-stock-binary` reintroduces the bug.
    The reference deployment's `ai.opencode.serve` LaunchAgent runs a binary built from
    `fix/subagent-effective-deny-inheritance` in the local opencode checkout (source version
    1.18.23; `dev` is an ancestor ~4,145 commits behind at 1.4.7 and is not a rebuild source).
    `~/.opencode/bin/opencode-1.18.23-dca.2` is the currently pinned binary; the earlier
    `opencode-1.18.23-dca-taskmodel` and `opencode-1.18.22-dca` files are rollback artifacts,
    never a branch or rebuild source.
    Verified live: a parent with appended `[bash deny, bash allow]` spawned a task child with no
    inherited bash deny that ran bash successfully. Session-level Plan enforcement is still
    required regardless — the resolved Plan agent is not read-only after project merges.
    That branch now carries a **second** fork-only patch: an optional `model` parameter on the
    `task` tool (leoncheng57/opencode#4), giving explicit model > subagent model > parent model.
    Upstream's active implementation of the same feature, anomalyco/opencode#34947, additionally
    gates it behind a `model_override` permission defaulting to **deny**, so an agent cannot
    silently move work to an expensive model; earlier ungated attempts (#26535, #29447) were
    closed as superseded. This fork has no such gate, so adopting that binary accepts unbounded
    agent-chosen model cost. Do not propose the fork's version upstream as a competing PR.
    **A fork build must say so in its version string.** Build it as
    `OPENCODE_VERSION=<upstream package version>+dca.<n> OPENCODE_CHANNEL=prod`, where `<n>` counts
    the fork patch set — today `1.18.23+dca.2` (1: the deny fix; 2: the task `model` parameter).
    That string is what `/global/health`, `--version`, the LLM `User-Agent`, MCP `clientInfo` and
    the durable per-session `version` field all report, so a plain `1.18.23` would attribute
    fork-only behaviour — a `task.model` parameter stock 1.18.23 does not have — to upstream.
    Use SemVer **build metadata (`+`), never a prerelease (`-`)**: OpenCode gates plugin loading on
    `semver.satisfies`, and a prerelease sorts *below* `1.18.23` and fails ordinary ranges like
    `>=1.18.0`, while build metadata is stripped before comparison and behaves as the release does.
    Both env vars are mandatory: without `OPENCODE_VERSION` the build stamps `0.0.0-<branch>-<ts>`,
    whose major of 0 silently disables the plugin engine check, and without `OPENCODE_CHANNEL=prod`
    the channel is inferred and can change database and websocket behaviour. Name the executable
    after the version with `+`→`-`; the filename is a convenience label, never the source of truth.
    `EXPECTED_SERVER_VERSION` pins the full string including `+dca.<n>` and is compared exactly, so
    an accidental fallback to a stock binary — which reintroduces the #75 bug — is visible rather
    than tolerated. Bumping `<n>` means updating this list, the pin, and the deterministic fixtures
    together.
20. **A file reference is data the server verified, never a URL the client trusted.**
    The client contract is `WorkspaceTarget { path, startLine?, endLine? }`, not a route:
    following a reference must not change the browser location, because the drawer is a
    temporary overlay and the reader's place in the transcript is the thing being
    preserved. Candidates come from parsed Markdown nodes — inline code spans and explicit
    links only — so bare prose, fenced examples, absolute paths, `~`, `..`, `file://`,
    UNC/Windows drives, query strings and non-line fragments never become candidates at
    all. Surviving candidates are collected from the frozen `TranscriptEvent` list rather
    than during render, deduplicated, and validated in one batched
    `POST /api/workspace/references` (64 per request, rejected rather than truncated),
    because each check spawns `git check-ignore` and one request per rendered code span
    would be a process storm on a streaming turn. Only `status: "file"` becomes
    interactive, and the UI opens the server's canonical `resolvedPath`, never the
    candidate — a symlink alias re-resolved later could point somewhere else.
    `server/opencode/workspace.ts` reuses `requireReadableWorkspacePath`, the same
    authority the read routes use, so validation can never be a wider door than the route
    it gates. A client-side match grants nothing; an unverified candidate simply renders
    as the ordinary text it renders as today.
21. **Composer workflows are forms first, and their injectors are visible-but-trusted.**
    The Workflows picker beside Reminder (#167) offers exactly three guided actions —
    Playwright UI review, send an update to another session, launch a Managed Child.
    Choosing one only opens a form; the sole exits are Cancel, "Apply to composer"
    (fills the draft, never sends), or the explicit Send/Launch on a preview that shows
    the exact generated prompt AND the trusted injector. Injectors invert the reminder
    secrecy rule deliberately: `GET /api/workflows` exposes the body so it can be read
    before submission, but sends still only carry the workflow *id* — the server
    (`server/workflows/workflows.ts`) resolves the text again at submit time, so a
    tampered browser cannot author hidden prompt content. The injector rides the
    persisted message as a `<workflow name="id">` sentinel with byte-identical
    client/server splitters (dual-copy-tested like reminders); the transcript strips it
    back out of the user bubble. Session updates send in the TARGET session's own mode
    (a hardcoded Build would restore write access to a session left in Plan), and the
    dialog states that prompt_async 204/202 means accepted, not completed. The
    managed-child form reuses decision #19's route and creates no task card and no
    automatic hand-back.
    That form has **no agent roster of its own**: it reads `GET /api/managed-child-agents`,
    the same catalogue the dedicated launcher reads, and derives the authorization
    requirement from each agent's `access === "can-modify"`. It shipped with a hardcoded
    `["plan","build"]` pair, which hid `explore` and `general` and — worse — decided
    "needs consent" by comparing an id to `"build"`, so a fourth can-modify agent would
    have launched unauthorized. Only the catalogue knows which agents survived the
    server-side filter and which can modify files. The default is a read-only agent so
    the pre-selected choice is never the one still missing consent, the consent resets on
    **every** agent change (an authorization for one agent is not one for the next), and
    an unreadable catalogue disables launch with a visible reason rather than presenting a
    dead button. Its `ModelPicker` must pass `portalLayer="nested"`: the default `z-[90]`
    portal renders *behind* this `z-[95]` dialog, and "nested" is also what inerts and
    `aria-hidden`s the parent so focus cannot land underneath the open picker.
22. **PR previews are static simulators, never public agent servers.** GitHub Pages cannot
    host the Express BFF or `opencode serve`, and putting either on a public endpoint would
    require credentials and expose host-level agent authority. `VITE_PUBLIC_SIMULATOR=true`
    therefore builds the real client with a browser-local `/api` fixture adapter, hash
    routing, a visible simulator banner, and no service worker or PWA manifest. Mutations
    are tab-local and reset on reload. Same-repository PRs build on every commit, publish
    only `gh-pages:pr-previews/pr-<number>/`, create a transient GitHub Deployment, and
    maintain one `<!-- pr-preview -->` comment; forks build an artifact but never publish
    JavaScript on the repository's Pages origin. The artifact manifest is bound to PR,
    full SHA, base path, file sizes, and SHA-256 digests and is revalidated before the
    shared non-force Pages write. Preview, screenshot, and public-site writers all use the
    `pr-screenshot-publication` concurrency group. Close cleanup removes only that PR's
    preview and screenshot directories, deletes their marker-owned comments, and marks the
    preview deployments inactive.
23. **Notifications group by session, and a folded group must still say what is
    waiting.** A session that needs three things wrote three rows repeating its title,
    which was the clutter. Grouping is device-local presentation and, unlike the two
    noise filters, is **never sent to the server**: it hides no record and changes no
    count, so no badge can disagree with it. Identity is the **`sessionID`** — never
    `sessionTitle`, which is snapshotted at append time (decision 10b), so one session
    contributes several titles as it is renamed and two unrelated sessions can share
    one; keying on it would both split a session and merge strangers. Records with no
    session fall into one bucket that always sorts last. Groups ship **on and folded**,
    which is only safe because the header carries a kind chip strip ordered
    blocking-first: with a bare count, a default-collapsed group would hide an
    unanswered permission behind a number, and that hiding is the exact failure the
    "outside this view" notices exist to prevent. Expansion state is **one persisted
    boolean plus in-memory per-group toggles** — session ids are unbounded and outlive
    their sessions, so a persisted set of them would grow forever and accumulate ids of
    deleted work. Grouping happens **inside** the Active/Resolved split, never across
    it: that split is the action axis and stays outermost. A group header counts the
    rows it renders, not the session's lifetime total, because the window is bounded and
    the section's existing outside-window notice is the only honest claim about the
    unwindowed log; the client window and server `MAX_PAGE` were raised to 1000 together
    so that count is rarely a lie, while retention is 5,000 per capped category.
    Resolution stays reversible per decision 10: every row can still be reopened.
    **Resolve all (N)** on a session header is a deliberate, bounded exception to
    one-at-a-time action: it accepts only that group's currently loaded unresolved ids,
    states that exact count, requires confirmation, and never affects another session
    or older records outside the window. It persists the batch in one write rather than
    firing N requests, then returns every changed record to the ordinary Resolved list.
    Every row keeps its own link to the session, and a
    folded header carries one too so a group is reachable without being opened first;
    grouping moved the repeated *title* out of the rows, never their ability to
    navigate. That link is built client-side from `sessionID` + `directory` rather than
    from `record.click`, which is the **outbound** ntfy/Web Push URL: it is absolute,
    cross-origin, and `undefined` whenever `PUBLIC_APP_URL` is unset, so reusing it
    made an outbound-delivery setting decide whether the in-app UI could navigate at
    all — and made every notification inert in the fixture-backed PR simulator.
    The Active/Resolved split lives in the **URL** (`?state=active`), not component
    state: "what still needs me" is the view worth bookmarking. `all` is the absence of
    the parameter so the canonical link stays bare, an unrecognized value degrades to
    `all` rather than erroring, and the pills `replace` rather than push so Back keeps
    meaning "the page I came from". Resolution is a **button with `aria-pressed`**, not
    a checkbox: it is the row's only action and a 13px target was wrong for it,
    especially in a thumb-driven popover. It stays reversible.
24. **The server decides who gets pinged; the browser is not allowed a second opinion.**
    `useNotifyWatcher` used to re-derive notification kind from raw upstream events, so
    it had no view of session lineage: every delegated child's turn produced a desktop
    popup, a sound and speech in every open tab while the server filed the same event
    as `suppressed: "subagent"` and hid it from the inbox and the badge. Being pinged
    for things the notification list denies ever happened is the loudest half of the
    over-notification report (#180). The browser now reacts **only** to
    `notification.recorded`, which carries the server's post-append verdict, and skips
    anything `suppressed`. Raw events are still forwarded untouched for the transcript
    and the sub-agent ledger. Consequences: the record id becomes an exact dedupe
    identity instead of a heuristic, and the server stamps one OS notification `tag`
    onto both the push payload and `notification.recorded`, used by `new Notification`
    and the service worker alike, so N open tabs — and a foreground PWA that also
    receives the push — collapse to one popup instead of stacking. The tag is
    **session-scoped** (record-id only for sessionless records), because Web Push
    cannot retract a shown notification and replacement via a shared tag is its only
    correction: with per-record tags, a session that asked for bash seven times left
    seven stale "Needs approval" cards piled in the OS notification center, most of
    them already answered in the app. One replaceable slot per session means a later
    ask overwrites the stale one, the parked escalation overwrites the ask it
    escalates, and the eventual idle overwrites whatever was left. Collapsing is
    presentation only: the per-record dedupe still governs sound and speech, so a
    distinct record is never silently skipped.
25. **A kind switched off in every channel is suppressed, not silently badged.**
    Preferences used to gate delivery only, so turning a kind off silenced the ping but
    still wrote a permanent unresolved record — and `abort` ships disabled, so every
    Stop press added an item nobody opted into. Those records now carry
    `suppressed: "preference-off"`, the third category in `SUPPRESSION_REASONS`, with
    the full decision 10a treatment: recorded so "why was I never told?" stays
    answerable, never delivered, prune-capped, filtered out of both `list()` and
    `activeCount()` by a default-on checkbox that states its own cost. A channel merely
    being *unconfigured* does not count — "I never set up ntfy" is not the instruction
    "do not tell me about this", and only the second may suppress. Relatedly, the parked
    escalation now only arms when a parked alert could actually reach someone, and the
    5-second echo dedupe runs *before* the lineage lookup rather than after, so upstream
    echoes stop burning the 4-slot concurrency budget that the sub-agent gate depends
    on — it used to fail open during exactly the bursts it exists for.
26. **Notification records carry a bounded excerpt of what the agent actually said.**
    "Finished its turn and is waiting for you" is identical every time, so three of them
    from one session said nothing about which was which — the complaint in #186, made
    obvious by grouping them under one header. `detail` is fetched only for a delivered
    `idle` (a permission already names its tool, a question carries its preview, an error
    its reason) and costs one upstream read that borrows the session lookup's exact
    discipline: hard timeout, shared concurrency budget, fail open to `undefined`. A
    missing excerpt costs the row specificity; a stalled one would cost the user the
    ping. It is **in-app only** — never copied into the outbound ntfy/Web Push body,
    which stays deliberately lock-screen-safe — and bounded on both write and read,
    because `normalizeRecord` is the only barrier against a hand-edited file and this is
    model-authored text on a durable record. Retention rose to 5,000 per capped
    category; unresolved *delivered* records remain exempt from every cap.
27. **Docker is optional test infrastructure, one container per Playwright invocation.**
    Worktrees isolate source and dependencies but not the machine-global fixtures the E2E
    suite writes: `/tmp/mock-*`, their real `.git` directories, and ports 3410/4599/4600.
    Distinct ports isolate listeners, not filesystems, so concurrent runs raced on one Git
    index. `Dockerfile.e2e` + `scripts/e2e-docker.ts` give one invocation its own
    filesystem/PID/network namespace, and the fixed paths and ports are deliberately
    UNCHANGED inside it — which is why this lane migrated zero specs. Rejected: Compose
    (a shared long-lived stack reintroduces the shared state) and per-spec containers
    (cost without benefit, since one BFF already serves all spec files).
    The runtime takes no mount of any kind: no Docker socket, host home, credentials,
    host `/tmp`, writable source or writable artifact destination; plus `--network none`,
    `--cap-drop ALL`, `no-new-privileges`, `--init`, private `--shm-size`, bounded pids,
    non-root uid 1000, and no published ports. Source reaches the image only as a
    `.dockerignore` **allowlist** snapshot, so `.git`, `.env*` and `.state/` are absent
    rather than merely unreferenced — verified, not assumed. Artifacts are exported with
    `docker cp` from the *stopped* container into a launcher-chosen unique directory, then
    validated host-side: symlinks are refused rather than followed, and the bundle is
    count/size-bounded. A writable artifact bind was rejected precisely because the
    container could then delete host files. Cleanup names exactly one generated container
    and, only when it built it, one generated image tag — never a path from test output.
    `--read-only` root is deliberately NOT set: `/artifacts` must live in the container
    layer for `docker cp` to reach it after exit, and a tmpfs or bind would defeat that.
    The container layer is discarded on `rm`, so this costs no host isolation.
    Two limits are permanent, not bugs to fix later. Docker does not touch same-run
    cross-spec races — one container still hosts one BFF and one mock for every parallel
    spec file, so `tests/e2e-shared-state-ownership.test.ts` stays. And it cannot prove
    macOS behaviour, so `tests/host-contract.test.ts` keeps `/private/tmp`
    canonicalization, real symlink containment, host `git check-ignore` and `0600` state
    modes host-native. Honest framing, stated wherever the lane is documented: this is a
    state-isolation boundary, not a hostile-code sandbox. A PR can edit `Dockerfile.e2e`,
    the launcher and the npm script, so `test:e2e:docker` is a convenience command whose
    security depends on the checkout; untrusted review needs a trusted launcher and image
    definition from outside the tested tree. In CI the ephemeral read-only-token runner is
    that boundary.
    A preflight probes the daemon before building and, when Docker is absent, exits
    **69** (`EX_UNAVAILABLE`) rather than 1, so "the lane never ran" is machine-
    distinguishable from Playwright's "tests failed"; `summary.json` is written on that
    path too, carrying `failureKind`. It never falls back to the host lane automatically:
    free ports do not prove exclusivity, because a sibling worktree on a different `PORT`
    still writes the same `/tmp` fixtures, so the launcher names `npm run test:e2e:host`
    as an operator override instead of choosing it. A build failure after a successful
    probe stays exit 1 — that is a real defect and must not be excused as an environment
    problem. No per-PR image is published to GHCR: BuildKit `type=gha` cache scoped
    by platform + schema (not commit SHA) keeps the `npm ci` and browser layers warm
    without a registry, a write token or fork restrictions.
28. **DSH Trajectory is a bounded DCA-captured projection, not DSH persistence.**
    The pinned contract is DeepSeek Harness `dsh-v0.1.1-rc.2` at `b150a551`:
    `session.event` carries `type`, native `seq`, epoch-millisecond `time`, `data`, and
    optional `ignorable`, `sourceEventSeqs`, and `surfaceOp`. The bridge captures events
    only while it is running, deduplicates native seq, and assigns a separate DCA
    observation sequence. List/export responses always report
    `complete: false`, `mayContainGaps: true`, capture bounds, and observed native gaps.
    **Why capture rather than replay, stated precisely, because the loose version of
    this claim was wrong.** The *Python SDK* exposes no session list/read/replay: its
    surface is `start_session`/`run`/`session_prompt`, `start_session(id)` constructs a
    local object without replaying, and the entire client→server request map in
    `packages/sdk/protocol/src/types.ts` is `initialize`, `session/prompt`, `shutdown`,
    so even the generic `request()` escape hatch has nothing to call. But DSH *as a
    whole* does expose durable history: `@deepseek-ai/dsh-session-persistence[-jsonl]`
    are published on npm at the same `0.1.1-rc.2`, and `SessionPersistence` offers
    `list`, `listSnapshots` (cheap change tokens), `inspect`, `readRaw` and
    `readFrom(id, fromSeq)` — a documented watermark replay primitive for exactly this
    kind of read model, verified working from plain Node. DCA does not use it **yet**,
    and the reasons are cost and hazard, not absence: every published version is a
    release candidate; the backend constructor unconditionally installs a write path and
    needs a stub `sessions` service on a cordis `Context`; `koffi` is a native
    transitive dependency; the operator's cordis file is sha256-pinned so persistence
    must be *detected*, not mandated; and `load`/`prepare` sit beside the read methods
    while performing cold recovery that **durably rewrites** the harness's own log, so a
    read model must never call them. DCA never parses native or compressed DSH JSONL by
    hand — the vendor package is the only acceptable reader.
28a. **Durable mode reads the harness's own log; capture is the fallback, and the
    difference is typed.** `server/dsh/durable.ts` constructs the vendor JSONL backend as
    a reader and exposes only `list`/`listSnapshots`/`readFrom`. `load` and `prepare` are
    not surfaced at all rather than left available, because they perform cold recovery
    that rewrites the harness's log. DCA already owns the root: the bridge passes
    `session_root`, the SDK exports it as `DSH_SESSION_ROOT`, the stock composition
    resolves the backend's `root` from it, and the seatbelt profile only grants writes
    under that same state directory — so a composition that persists persists there.
    Persistence is still **detected, never mandated**: the operator's cordis file is
    sha256-pinned and may use `!!js` expressions only the runtime can evaluate, so DCA
    probes for a session artifact instead of parsing YAML. The artifact *filename* names
    the encoding, which matters because a reader built for the wrong `compression`
    throws on every read (it never misparses) and the default when the key is omitted is
    `zstd`. Detection is lazy and re-probed while unavailable, since the first session on
    a fresh install creates the very artifacts being looked for.
    Coverage is a **discriminated union**, not two booleans: the capture arm keeps
    literal `complete: false` / `mayContainGaps: true`, so a bounded capture still cannot
    be typed as complete. A durable read that returns *no* events is deliberately not
    treated as durable — an empty answer must never be promoted into a completeness
    claim. Durable events are projected through the same `nativeProjection` and sanitizer
    as captured ones, so the metadata-only safe-row rules hold whichever source answered,
    and their ids derive from the immutable log so repeated reads are stable.
    The two sources are **merged, not swapped**: the durable log is complete for what DSH
    did but knows nothing about what DCA observed around it, so `dca-lifecycle` records —
    a rejected prompt, a bridge exit, a capture gap — are interleaved by time and
    duplicate captured *native* events are dropped in favour of the durable ones.
    OpenCode Run Log remains a separate transcript-derived feature and is unchanged.
    Safe trajectory rows are an event-type-specific metadata projection. They never
    inspect arbitrary payload text and never derive prompt, system/context text,
    commands, paths, tool arguments/results, reasoning, compaction summaries, or model
    output. Raw captured detail is sanitized before persistence with depth/node/string/
    array/object/byte caps and credential-shape redaction. A bridge stdout frame larger
    than 1 MiB is rejected before `JSON.parse` and the bridge is terminated so the run
    cannot continue across an invisible observation gap.
    There is no app-level authentication yet; the deployment still depends on private
    Tailscale reachability. Therefore sensitive one-event detail defaults off and requires
    `DSH_TRAJECTORY_SENSITIVE_ENABLED=true`, an explicit UI reveal, and a `POST` response
    marked `private, no-store, nosniff`. Full captured-detail export needs that flag plus
    `DSH_TRAJECTORY_FULL_EXPORT_ENABLED=true` and a separate confirmation. Sensitive UI
    state is cleared on drawer close, document backgrounding, and session change. No
    trajectory payload enters notifications, analytics, URLs, browser storage, or the
    service worker. Projection directories/files are forced to `0700`/`0600`, with age,
    event-count, session-file-count, per-file-byte, and total-byte retention caps.

## Client conventions (inherited from the OpenHands runner, still enforced)

- `client/ds/` primitives are forwardRef + `cn()` + semantic `var(--color-*)` tokens
  only. **Never raw hex.**
- Every interactive element carries a `data-testid`.
- No new runtime dependencies without a reason recorded here.
- `@deepseek-ai/dsh-session-persistence-jsonl` + `@deepseek-ai/cordis` are pinned exactly
  and exist only to read DSH's durable session log (decision 28a). Hand-rolling a reader
  for a compressed, versioned, append-only format the harness also writes is precisely
  the thing not to do: the vendor reader refuses a newer log version and refuses unknown
  event types rather than misparsing them. `@deepseek-ai/cordis` is the fork the package
  actually imports `Service` from — plain `cordis` happens to work but is not what it
  declares. `koffi` arrives transitively, is Windows-only (`kernel32.dll`, behind a
  dynamic `import`), and its install script is not approved here, so no native build runs
  and the module is never loaded on macOS or Linux.
- `mermaid` is the lazy-loaded diagram parser and layout engine for repository-owned
  in-app docs only. It runs with Mermaid strict security, then its generated SVG is
  stripped of links, executable DOM, embedded resources and unsafe CSS before mounting.
- `qrcode-generator@2.0.4` is the sole QR runtime dependency: it creates the
  phone-transfer matrix entirely in the browser, avoiding URL disclosure to an
  external image service. The app reads its matrix API and renders a React SVG
  path rather than injecting the package's generated markup.
- `react-markdown` + `remark-gfm` render agent prose. `client/ds/markdown.tsx` used to
  be a regex chain producing an HTML string for `dangerouslySetInnerHTML`, and its own
  header comment named these two packages as the replacement once the surface grew.
  Issue #140 grew it: a verified `scripts/launchd.ts:222` has to become a real button,
  and injecting controls by pattern-matching generated HTML is how a rendering bug
  becomes an injection bug. Rendering from parsed nodes also *removes*
  `dangerouslySetInnerHTML` from this path entirely. Consequences worth stating: raw
  HTML in the source is dropped rather than rendered (no `rehype-raw`, deliberately),
  `untrusted` still entity-escapes first so that markup survives as visible text,
  markdown images render their alt text instead of an `<img>` — an agent-chosen `src`
  is an SSRF and tracking-pixel surface — and a ~15-line local remark plugin restores
  single-newline hard breaks rather than adding `remark-breaks` for that alone.
- CodeMirror 6 (`@codemirror/{state,view,language,search}` plus the
  `lang-{javascript,json,css,html,markdown,python}` grammars) is the read-only file
  viewer, loaded through `React.lazy` so a reader who never opens a file never
  downloads a parser — it is a ~550 kB chunk that stays out of the main bundle. It was
  chosen over Monaco, which does not support mobile browsers, and over embedding
  OpenVSCode Server, Theia or the OpenCode UI, which would each add a second process,
  a second security surface and a competing notion of workspace state. Read-only is
  enforced twice, by `EditorState.readOnly` and `EditorView.editable`, because this
  surface must never imply the reader can save. The grammar list is short on purpose:
  every grammar is bytes in that chunk, and an unknown extension renders as plain text
  rather than being guessed at. `@lezer/highlight` is a direct dependency because the
  viewer maps grammar roles onto app-owned semantic syntax tokens; CodeMirror's fixed
  default palette contains low-contrast primary blue and purple on this app's dark
  surface. Both light and dark token sets must keep every syntax foreground at WCAG AA
  text contrast against the editor surface.
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
