# Request and Event Architecture

| Field | Value |
|---|---|
| Snapshot date | 2026-08-26 |
| Status | `Snapshot — not maintained` |
| Repository commit | `39d6f48` |
| Records | How a browser request reaches OpenCode, how a prompt is submitted without blocking, and how one upstream event stream is fanned out to many browsers. |

> **This is a point-in-time snapshot.** It is deliberately not synchronized with the
> implementation and will drift as the code changes. `docs/architecture.md` and `AGENTS.md`
> remain the source of truth. Read this document for the reasoning captured on 2026-08-26,
> not for the current behaviour of the system.

## 1. Overview

A single long-lived OpenCode agent server runs on a developer workstation, and its only
first-party interface is a terminal UI. That interface is unreachable from a phone, holds no
credentials on the user's behalf, and exposes file routes that ignore agent permission rules.
This system places a React single-page application (SPA) and an Express backend for frontend
(BFF) in front of that server: the BFF owns credentials and path validation, converts the
blocking prompt call into an accepted-and-queued call, and multiplexes one upstream event
subscription out to every connected browser. This document records the three paths that carry
almost all traffic — the scoped request path, the asynchronous prompt path, and the global event
fan-out — together with the constraints of the upstream API that shaped each of them.

## 2. Background

OpenCode is an agent runtime distributed as a single binary. Started as `opencode serve`, it
exposes an HTTP API and a server-sent events (SSE) stream, holds sessions and their message
transcripts in its own storage, and executes agent tools — file reads, file writes, shell
commands — directly on the host as the user who launched it. It ships a terminal UI as its
primary client. There is no container, no separate agent sandbox, and no per-request
authentication beyond an optional HTTP Basic credential on the whole server.

One OpenCode process serves every project on the machine. Projects are not separate instances;
they are a parameter. Nearly every instance-scoped route takes `?directory=<absolute path>`, and
that query parameter is the entire project selector. In this document a **directory** means one
such absolute host filesystem path — a Git repository or a Git worktree — that both identifies a
project to OpenCode and is the working directory its agent tools operate in. A live instance was
observed serving 32 projects and 2,483 sessions.

A **BFF** is a server process that exists only to serve one specific client. It is not a
general-purpose API. This BFF terminates the browser's same-origin HTTP and SSE connections,
holds the OpenCode and forge credentials that the browser must never see, canonicalizes every
path the browser sends, adds capabilities OpenCode has no route for (local `git log`, GitHub and
GitLab context, notification delivery, a preview reverse proxy), and serves the built SPA in
production.

This is the successor to a container-based runner built on OpenHands, which is frozen. That
predecessor ran the agent runtime and a Postgres database inside Docker, and much of its
feature set existed to reach inside that container. Dropping the container dropped the need for
those features, and dropped the fixed-port constraint that had allowed only one running worktree
at a time.

## 3. Problem Statement

The agent server is already reachable and already useful from a terminal on the workstation. The
problem is everything that is not a terminal on the workstation.

From a phone there is no terminal pane, so the OpenCode terminal UI is not a degraded experience
but an absent one. That single fact is why a web client exists at all. Everything else the BFF
does is a consequence of putting a browser — specifically, a browser on a tailnet, which is a
network with more than one device on it — in front of a process that was designed for a local
terminal.

Four capabilities must be added, and each has a measurable size:

- **Credential isolation.** The OpenCode HTTP Basic credential, the GitHub token, and the forge
  tokens must never reach the browser. A browser that holds the OpenCode credential holds
  arbitrary host command execution.
- **Path validation.** OpenCode's file routes do not apply agent permission rules. A browser
  that can send an arbitrary absolute path to those routes can read every file the host user can
  read. Every browser-supplied path must therefore be canonicalized and contained before it
  reaches upstream.
- **Event fan-out.** The classic event stream is directory-scoped and single-subscriber in
  practice. A multi-project user interface with several tabs open needs one upstream
  subscription demultiplexed to many browser connections, not one upstream subscription per tab.
- **Recovery without a replay cursor.** The classic event stream emits no `id:` field and honours
  no `Last-Event-ID`. A dropped connection cannot be resumed; it can only be replaced, and the
  client must refetch whatever it missed.

The cost of building this is a second system to operate. It has its own supervisor entry, its own
port, its own failure modes, and its own persisted state, and it must stay in step with an
upstream whose published documentation understates its own surface: a live `GET /doc` returns
OpenAPI 3.1 describing 162 paths and 188 operations, against roughly 60 documented on the
website. Every contract in this document was read off a live server, not a docs page, and the
same will be true of every future change.

## 4. Tenets

1. **A durable poll beats a faithful stream.** A three-second poll that is always correct
   degrades to itself when the network fails, whereas a stream treated as the source of truth
   diverges silently the moment a frame is lost.
2. **The canonical path beats the caller's path.** Forwarding the string the browser sent
   reopens a validated hole, because a symlink can be swapped between the check and the use.
3. **Tolerating an unknown event beats validating it.** The upstream event union is larger than
   ours and grows on its own schedule, so rejecting what we do not recognize converts a server
   upgrade into a silent feature outage.
4. **One credential boundary beats browser convenience.** Every browser-facing call stays
   same-origin and unauthenticated-to-upstream, even when a direct call would be fewer hops,
   because a credential in a browser is a credential on a tailnet.
5. **Process-local honesty beats distributed coordination we cannot verify.** A mutex that
   admits it only covers this Node process is safer than one that implies a guarantee no second
   process or terminal UI would honour.
6. **One supervised process beats a better topology.** A single launchd-managed BFF beside an
   OpenCode server we do not start is worse on paper than an orchestrated stack, and materially
   easier to keep running on one workstation.

*Unless you know better ones.*

## 5. Goals

1. Make every OpenCode session on the host reachable and operable from a phone browser over a
   tailnet, with no terminal available.
2. Keep every credential — OpenCode, GitHub, GitLab, ntfy, Web Push — server-side, so the
   browser holds no secret and no direct route to the agent server.
3. Contain every browser-supplied filesystem path within configured roots before it reaches a
   route that would otherwise read arbitrary host files.
4. Submit prompts without holding an HTTP request open for the agent turn, so a phone that
   sleeps or a tab that closes cannot interrupt work already in progress.
5. Serve one upstream event subscription to an arbitrary number of browser tabs, and recover
   correctly after a disconnection despite the absence of a replay cursor.
6. Survive an upstream version bump without a code change for any event type, part type, or tool
   status we have never seen.

## 6. Scope

### In Scope

- The scoped request path from a browser URL through directory canonicalization to an upstream
  call.
- The asynchronous prompt path, including Plan and Build policy activation and the per-session
  serialization that guards it.
- The global event path: one upstream subscription, the in-process bus, browser SSE fan-out, and
  three layers of demultiplexing.
- The transcript adapter seam that keeps raw OpenCode message parts out of React components.
- Ownership and persistence of every piece of state the system holds, on the server and in the
  browser.
- Process topology and supervision, including what the BFF deliberately does not start.

### Out of Scope

Each exclusion below is deliberate, and the reason is that the capability either existed only to
reach inside the predecessor's container, or is already better served by a tool the user has
open.

- **Preview lifecycle controls** (start, stop, logs, status). These managed processes inside the
  container. Without a container the user starts a dev server in a terminal. The reverse proxy
  survives, because from a phone there is no terminal to read the URL from.
- **A terminal page and a web pseudo-terminal (PTY).** Both existed because the container's
  shell was otherwise unreachable. The host shell is reachable directly, and a read-only
  Commands panel derived from the transcript covers the review case without shipping remote
  command execution over a browser socket.
- **Provider and model settings pages.** Model and provider configuration lives in OpenCode's own
  configuration files, which have schema autocomplete. A second editor would be a second source
  of truth for the same values.
- **Manager runs.** These required the predecessor's Postgres database. Dropping the container
  dropped Postgres, and a cmux skill covers the workflow.
- **MCP and LSP latency probes.** `GET /mcp` already reports `failed{error}` and `needs_auth`,
  which is the diagnostic that mattered. A latency number would add a polling cost for
  information nobody acted on.
- **A permissions editor.** Permission matching is last-match-wins, so an editor that reorders
  rules can silently widen access. Authoring stays in `opencode.jsonc`, where the schema
  validates it, and this system displays the effective rules read-only.
- **Skills toggles and condenser settings.** OpenCode has no equivalent surface, so there is
  nothing to toggle against.

## 7. Requirements

### User Requirements

| ID | Priority | Requirement |
|---|---|---|
| U1 | **P0** | Open, read and continue any OpenCode session from a phone browser on the tailnet. |
| U2 | **P0** | Send a prompt and see it appear in the transcript without the browser staying connected for the turn. |
| U3 | **P0** | Select a project and have that selection survive a reload and a restart of the BFF. |
| U4 | **P0** | See a transcript that reflects the server's state after a network drop, without a manual refresh. |
| U5 | **P1** | Receive a notification when an agent needs an answer or a turn ends, on a device that is not in front of the machine. |
| U6 | **P1** | Read repository context — status, recent commits, file contents — without leaving the conversation. |
| U7 | **P1** | Know which policy, Plan or Build, produced any given message already on screen. |
| U8 | **P2** | Reach a locally running preview server from the phone without knowing its port. |

### Technical Requirements

| ID | Priority | Requirement |
|---|---|---|
| T1 | **P0** | No OpenCode, forge, ntfy or Web Push credential is ever sent to the browser; every browser-facing API is same-origin. |
| T2 | **P0** | Every browser-supplied path is canonicalized with `realpath` and contained beneath a configured root before any upstream or filesystem use; the canonical result, never the caller's string, is what is forwarded. |
| T3 | **P0** | No UI request may hold an HTTP connection open for the duration of an agent turn. |
| T4 | **P0** | Unknown event types, unknown message part types and unknown tool statuses must be forwarded or degraded, never rejected, and no reducer may throw on them. |
| T5 | **P0** | Transcript state refreshes on a 3-second poll while a session is open, and a reconnecting client refetches rather than resuming, because no replay cursor exists. |
| T6 | **P0** | Plan and Build policy activation and prompt submission are one critical section, serialized per directory and session. |
| T7 | **P1** | The browser SSE keep-alive interval is 15 seconds, independent of upstream's own 10-second heartbeat, so a fully filtered stream still proves liveness. |
| T8 | **P1** | Client SSE reconnection uses a capped 2, 4, 8, 16, 30-second backoff and closes the source itself rather than relying on browser-default retry. |
| T9 | **P1** | React components must not import OpenCode SDK types or read a raw message part; that mapping lives in exactly one module. |
| T10 | **P2** | Upstream version skew is reported, never fatal. |

## 8. Assumptions and Dependencies

### Assumptions

Each of the following is falsifiable, and the system's behaviour changes if it is false.

- Exactly one `opencode serve` process is running, and it is already running before the BFF
  starts. Falsified by a stopped server: every upstream call fails and the event supervisor
  retries forever.
- One user operates the system. There is no per-user identity anywhere, so a second person on
  the tailnet is the same principal.
- The tailnet is the security perimeter for reachability. Falsified by a hostile device on the
  tailnet, because the BFF has no authentication middleware.
- All projects live beneath the configured projects root or worktree root. Falsified by a
  project elsewhere: it is not reachable, by design.
- A browser tab is short-lived relative to a session. Falsified by a tab left open for days,
  which is why the keep-alive and the visibility gate exist.
- Agent turns outlive requests. Every prompt is queued, so a closed tab must not cancel work.

### Dependencies

| Dependency | Purpose | Limitation named |
|---|---|---|
| OpenCode 1.18.22 | Sessions, transcripts, agent execution, event stream | The classic event stream has no replay cursor: no `id:` is emitted and `Last-Event-ID` is not honoured. `/session/status` is process-local, so absence is not proof of idleness. `GET /find` silently caps at 10 results. `GET /file/status` and `GET /find/symbol` return `[]` unconditionally and are unusable. `Todo` has no `id`, so task rows are keyed by index and content. |
| Host filesystem | Project and worktree discovery, file reads, path canonicalization | Discovery is a bounded walk, not an index; symlinks must be resolved rather than trusted. |
| Git (host binary) | Status, recent commits, ignore checks | Shelled out per call, because no upstream route exists for commit history. |
| Tailscale | Reachability from a phone | Provides network reachability only. It is not authentication, and the BFF adds none. |
| launchd | Supervision of the BFF | Supervises the BFF only. It does not supervise OpenCode, and this system never starts or stops OpenCode. |

## 9. Proposed Design

### Process topology

Three processes run, none containerised: the browser, the Express BFF, and `opencode serve`.

`opencode serve` is **not started by this application**. `deploy/README.md:137` states it
directly: "The BFF never starts OpenCode. It connects to the one server named by `OPENCODE_URL`
in `.env`." The default upstream port is 4096 (`server/opencode/client.ts:50`). One OpenCode
process serves every project, selected per request by `directory`.

The Express BFF terminates all browser traffic and, in production, also serves the built SPA.
Its launchd label is `ai.custom-dca-opencode.bff` (`scripts/launchd.ts:7`) and its supervised
port is 3210 (`scripts/launchd.ts:8`), while the development default is 3000
(`server/index.ts:46`). It binds `0.0.0.0` (`server/index.ts:135-137`) so that a phone on the
tailnet can reach it. Two guards protect installation: `scripts/launchd.ts:73-75` refuses to
install a supervised service on port 3000, keeping the development port free, and
`scripts/launchd.ts:112-118` refuses to install at all if the target port already has a listener.

In development a Vite dev server runs on 5173 and proxies only `/api` to the BFF
(`vite.config.ts:58-60`). In production the BFF serves `express.static` plus a SPA fallback
matching `/^\/(?!api\/).*/`, registered **after** every `/api` router
(`server/index.ts:125-133`); that ordering is what stops the fallback from swallowing unmatched
API routes.

The generated plist runs the service as `gui/${process.getuid()}` with program
`[process.execPath, dist/server/index.js]` and no shell, sets `WorkingDirectory` to the
repository root — which is how `dotenv.config()` at `server/index.ts:43` finds `.env` — and
passes an environment of only `HOME`, `PATH`, `NODE_ENV` and `PORT`. There are **no credentials
in the plist** (`deploy/README.md:127-133`); secrets stay in `.env`, read at boot from the
working directory. Uninstall is correspondingly narrow: it never runs `pkill` and never touches
OpenCode (`scripts/launchd.ts:213-220`).

Boot order in `server/index.ts` is fixed, and the middleware list is short enough to state in
full: `dotenv.config()` at `:43`; `express.json({limit:"20mb"})` at `:50`, which is **the only
middleware registered before routes**; the EventBus at `:53`; the AutoPermissionService at
`:57-58`; the notification stores at `:59-61`; `webPushConfig()` at `:62`, which throws at boot
on a partially configured VAPID key pair rather than silently disabling push; the
NotificationService at `:63-73`; `bus.start()` at `:74`; 15 routers at `:76-91`; the health route
at `:98`; and static serving at `:127`.

What is **verified absent** from that list matters as much as what is present. There is no CORS
middleware and no `Access-Control-*` header anywhere in the server. There is no `helmet`, no
request logger, no rate limiter, and **no authentication middleware**. Every browser-facing route
is reachable by anything that can reach the port, which is the direct consequence of treating the
tailnet as the perimeter.

```mermaid
flowchart TD
  Phone["Browser: desktop or phone over Tailscale"]
  SPA["React SPA"]
  BFF["Express BFF :3210"]
  OC["opencode serve :4096"]
  Host["Host filesystem and git"]
  Forge["GitHub or GitLab"]

  Phone -->|"same-origin HTTP and SSE"| SPA
  SPA -->|"/api"| BFF
  BFF -->|"HTTP plus Basic auth"| OC
  BFF --> Host
  BFF -->|"server-side tokens"| Forge
  OC -->|"tools run as host user"| Host

  subgraph Trust["Trust boundary: credentials and path validation"]
    BFF
  end

  Launchd["launchd ai.custom-dca-opencode.bff"] -->|"supervises"| BFF
  Launchd -.->|"never supervises"| OC
  BFF -.->|"never starts"| OC
  OC --- Projects["One process serves every project, selected by directory"]
```

### The directory-scoping contract

A project selection begins as a string in the browser and must become a canonical host path
before it is used. The chain is short and every link is load-bearing.

The selection is read from the URL and `localStorage` at `client/pages/Hub.tsx:159` and persisted
at `client/pages/Hub.tsx:193-195`. Every client call attaches it through `scoped()`
(`client/lib/api.ts:447-451`). On the server, `directoryOf(req)`
(`server/routes/sessions.ts:62-66`) reads it, with the query parameter winning over the body.
`requireWorkspaceDirectory` then canonicalizes it, and the **canonical** result — never the
browser's string — is what reaches upstream, injected into the query at
`server/opencode/client.ts:122`.

`server/paths.ts` is the whole validation surface. It exports `PathError` (`:9-17`),
`projectsRoot` (`:25-27`), `worktreesRoot` (`:29-33`), `requireProjectDirectory` (`:42-72`),
`requireWorkspaceDirectory` (`:74-83`), `requireRelativePath` (`:86-96`),
`isSensitiveWorkspacePath` (`:98-102`) and `requireReadableWorkspacePath` (`:105-147`).
`requireWorkspaceDirectory` tries the projects root first and retries the worktree root **on 403
only**, so a genuine 400 is not masked by a second attempt.
`isSensitiveWorkspacePath` denies `.git`, `.env*`, `.ssh`, `.aws`, `credentials`, `id_rsa` and
`id_ed25519`.

The validation order inside `requireProjectDirectory` is fixed, and each step has its own status
code: non-empty string (400), absolute (400), `realpath` on both the candidate and the root, with
a throw becoming 400, `isDirectory()` (400), not the root itself (403), containment beneath the
root (403), and finally return the canonical path. The rationale is recorded at
`server/paths.ts:35-41`: OpenCode's file routes do not apply agent permission rules, so checking
only for an absolute path would expose every readable host file to a browser on the tailnet, and
`realpath` also closes symlink escapes from the projects root.

The canonical-path rule at `server/paths.ts:144-146` extends that reasoning to relative targets:
callers must forward the canonical relative target, never the original symlink alias, because the
link could be swapped after validation and before use. It is honoured at
`server/routes/workspace.ts:26-27,37-38` and `server/opencode/workspace.ts:166-177`.

`requireReadableWorkspacePath` adds one more gate beyond containment and sensitivity: it runs
`git check-ignore -q` with a 5-second timeout (`server/paths.ts:135`). Exit code 0 means the path
is ignored and produces a 403; exit codes 1 and 128 pass, so a non-repository directory does not
become unreadable.

| Input | Status |
|---|---|
| Missing directory | 400 |
| Relative path | 400 |
| Nonexistent path | 400 |
| Path is a file | 400 |
| Path equals a configured root | 403 |
| Path outside both roots | 403 |
| Projects root itself unreadable | 500 (`server/projects.ts:55`) |

Two routes are **deliberate exceptions** to this contract.

`GET /api/events` does not validate the directory at all (`server/routes/sessions.ts:730-731`).
The directory there is a pure string-equality filter (`server/routes/sessions.ts:743`) that can
only narrow a stream which has already been fanned out; it grants no access and reaches no
filesystem. The accepted cost is stated plainly: an unnormalised path silently matches nothing,
producing a connection that receives only unscoped events and never an error.

`GET /api/recent-sessions` drops invalid directories rather than rejecting the request
(`server/routes/recents.ts:96-100`), because its candidate set comes from `localStorage`, which
outlives project renames and travels between machines. Rejecting the whole request would blank a
panel that is mostly about other, still-valid projects.

Project discovery is bounded by **two** caps plus a depth limit:
`PROJECT_SCAN_MAX_RESULTS = 500`, `PROJECT_SCAN_MAX_DIRECTORIES = 5_000`, and
`PROJECT_SCAN_MAX_DEPTH = 5` (`server/projects.ts:6-9`). `AGENTS.md` decision 12 conflates the
first two, describing discovery as "capped at 500 directories"; the 500 is a cap on results
returned, while 5,000 is the cap on directories visited during the walk.

### The typed fetch seam

Every upstream call passes through one module, and the reason is recorded in that module.
`server/opencode/client.ts:29-34` states that `@opencode-ai/sdk` is deliberately not used: its
bundled v1 query types are narrower than the live server — `session.list` accepts only
`directory` in the SDK, while the server also takes `limit`, `roots`, `search`, `start` and
`scope` — and its event names are stale. Depending on it would mean casting around it constantly,
which defeats the purpose of types. The application owns a thin typed layer over `fetch` instead
and treats the live `GET /doc` as the contract. The SDK is not in `package.json`.

`requestWithResponse<T>` (`server/opencode/client.ts:116-146`) is the entire seam. It builds the
URL, injects the directory at `:122` before the generic query loop so a caller cannot omit it by
accident, sets `Accept: application/json`, adds the HTTP Basic credential through
`basicAuthHeader` (`:57-61`), raises exactly one error type — `OpencodeError(status, path, body)`
(`:84-93`), which truncates the upstream body to 300 characters — and handles 204 explicitly at
`:142-143`, because 204 is the success status for `prompt_async` and would otherwise fail JSON
parsing.

`EXPECTED_SERVER_VERSION = "1.18.22"` (`server/opencode/client.ts:37`) is asserted advisorily
only: version skew is reported and never fatal (`server/opencode/client.ts:163-167`,
`server/index.ts:101-111`). `eventStreamUrl` (`:74-81`) places the Basic credential in an
`?auth_token=` query parameter rather than a header, because `EventSource` cannot set headers.

**No timeouts and no retries exist at this layer.** The only `AbortSignal` that ever reaches it
belongs to `getSessionMetadata` (`server/opencode/sessions.ts:389,393`), used solely by the
notification service with a 2-second timeout. Every other call, including the entire prompt path,
can hang for as long as Node's `fetch` holds the socket open. This is a design gap, not a
simplification, and it is carried forward into the risk register: a wedged upstream connection
becomes a wedged browser request with no ceiling.

The application calls 30 distinct upstream paths and touches nothing under `/api/**`, the newer
event-sourced v2 surface. Where no upstream route exists, work is done locally: `git log` is
shelled out at `server/opencode/workspace.ts:226-233`.

Error mapping happens once, at `server/routes/sessions.ts:233-245`. An upstream 4xx passes
through unchanged. An upstream 5xx becomes **404** when the caller sets `notFoundOn5xx`, because
OpenCode answers 500 `UnknownError` for an unknown session id rather than 404
(`server/routes/sessions.ts:186-190`); otherwise a 5xx becomes **502**.

### The prompt path

The composer lives at `client/pages/Conversation.tsx:475-514` and is gated on
`canPrompt = agentIdentityKnown || foreignReady` (`:472-473`), with Send disabled when
`!canPrompt || sending || !draft.trim()` (`:990`).

**There is no optimistic transcript row.** `stream.refresh()` at
`client/pages/Conversation.tsx:502` is the only mechanism by which a prompt becomes visible, and
it becomes visible only on the next successful `GET /api/sessions/:id/messages`. The draft is
cleared before the transcript shows the message, so a failure between acceptance and the next
poll leaves a visually empty conversation for up to three seconds. That is an accepted cost: the
alternative is a speculative row that can contradict the durable poll, which tenet 1 rejects.

The Enter-to-send guard is reasoned at `client/pages/Conversation.tsx:530-531`: `send()` has no
re-entry guard and `prompt_async` returns as soon as the turn is queued, so a fast double Enter
would post two turns.

Only the reminder and workflow **id** cross the wire (`client/lib/api.ts:554-577`). Bodies are
resolved server-side, so a tampered browser can never author sentinel content that the server
would treat as trusted injected text.

The BFF route is `server/routes/sessions.ts:461-506`. `promptAgent` rejects the values `plan` and
`build` outright with the message "prompt Plan or Build through 'mode', which activates session
policy" (`server/opencode/sessions.ts:141-150`), because naming a mode as an agent would bypass
policy activation. The route responds **202** `{accepted:true}` (`server/routes/sessions.ts:504`).
The distinction matters: **the BFF returns 202 while 204 is the upstream `prompt_async` status.**
`docs/architecture.md:29` says the BFF "returns immediately", which is true of the agent turn but
not of the request — the request performs seven upstream calls before it answers.

`prompt` (`server/opencode/sessions.ts:858-868`) wraps policy activation and submission together
in `withSessionPromptLock`.

`activateModePolicy` (`server/opencode/sessions.ts:410-447`) is the policy step, in order: three
parallel upstream reads (`:417-424`); shape guards on the responses (`:425-428`);
`assertModeAgentIdentity` (`:429`), where the driving agents are the session agent and the latest
**user** message's agent, with assistant agents explicitly excluded from identity because of
`compaction` (`:196-206`); an **exact-suffix idempotency check** (`:431`) via `rulesEndWith`
(`:150-158`), which compares the last N rules field by field and is what stops repeated
same-mode prompts from growing the ruleset; a **Build short-circuit** (`:432-436`) that skips the
PATCH entirely unless `hasPlanDenial` (`:177-188`) finds a real Plan denial by scanning backwards
for the last rule with `pattern === "*"`, honouring last-match-wins; and otherwise exactly one
`PATCH /session/{id}` (`:438-442`).

Failure modes are distinct. An activation failure raises `ModePolicyActivationError` and returns
**502**, and `prompt_async` is never reached — a prompt is never submitted under an unverified
policy. An identity failure returns **409** with a code, because it is a client-correctable
disagreement rather than an upstream fault.

`PLAN_TOOL_ALLOWLIST` (`server/opencode/sessions.ts:32-42`) is `read`, `glob`, `grep`,
`webfetch`, `websearch`, `question`, `task`, `todowrite`, `skill`. `task` is in the allowlist, so
Plan appends no `task` rule and safe read-only delegation survives Plan mode.

`submitPromptAsync` (`server/opencode/sessions.ts:820-849`) is the single `prompt_async` call
site, and it **never sends a `tools` field**. Non-empty legacy `tools` entries persist on the
session as permission rules, so enforcing Plan through `tools` would leave write access denied
after a later Build prompt omitted the field.

The lock (`server/opencode/sessions.ts:104`, `:215-234`) is a promise-chain mutex keyed
`${directory}\0${sessionID}`, first-in-first-out (FIFO), with `previous.catch(() => undefined)`
applied twice so a rejected predecessor cannot poison the queue. It is held across the activation
reads, the PATCH and `prompt_async`. It is a module-level `Map`, and therefore **per Node
process**: a second BFF process, or a terminal UI prompting the same session, has no visibility
into it. That is the honest boundary behind the phrase "serialize process-locally", and tenet 5
is the reason it is stated rather than obscured.

`POST /session/{id}/message` is genuinely never used; the only `/message` occurrences under
`server/` are GETs. `server/opencode/sessions.ts:6-8` records why: it holds the HTTP response
open for the entire agent turn, which looks like a hang from a user interface and dies the moment
a client disconnects. Regression coverage at `tests/session-mode-policy.test.ts:47-50` asserts
that the mutation set for a prompt is exactly `{PATCH, prompt_async}`.

**One prompt costs seven upstream requests** at minimum, eight when the PATCH is required, and
nine or ten on a cold 15-second model cache:

1. Read the session.
2. Read the resolved agent list.
3. Read the latest messages, for user-message agent identity.
4. Read the effective permission policy.
5. Read the model catalogue, when the 15-second cache is cold.
6. Read capabilities, when the 30-second cache is cold.
7. `PATCH /session/{id}`, only when activation is not already idempotent and not short-circuited.
8. `POST /session/{id}/prompt_async`.

None of these has a timeout.

```mermaid
sequenceDiagram
  participant U as User
  participant C as Composer
  participant API as Client api.ts
  participant R as "BFF route POST prompt"
  participant M as "Per-session mutex"
  participant P as activateModePolicy
  participant OC as opencode serve
  participant S as "3s poll useSessionStream"

  U->>C: "Enter, no re-entry guard"
  C->>C: "Clear draft, no optimistic row"
  C->>API: "prompt with reminder id and workflow id only"
  API->>R: "POST /api/sessions/:id/prompt"
  R->>M: "acquire directory plus session key, FIFO"
  M->>P: "enter critical section"
  par Parallel reads
    P->>OC: GET session
    P->>OC: GET agents
    P->>OC: GET messages
  end
  P->>P: "assert identity, else 409"
  P->>P: "exact suffix idempotency check"
  alt "PATCH required"
    P->>OC: PATCH session permission rules
  else "Idempotent or Build short-circuit"
    P-->>P: "skip PATCH"
  end
  P->>OC: POST prompt_async
  OC-->>P: 204
  M-->>R: "release lock"
  R-->>API: "202 accepted true"
  API-->>C: "sending false"
  Note over C,S: "Transcript still empty here"
  S->>OC: "GET messages, next 3s tick"
  OC-->>S: "message list including the prompt"
  S-->>C: "prompt becomes visible"
```

```mermaid
flowchart TD
  Start["activateModePolicy for mode"] --> Reads["Three parallel reads: session, agents, messages"]
  Reads --> Guards{"Response shapes valid"}
  Guards -- no --> Fail502["ModePolicyActivationError, 502, no prompt_async"]
  Guards -- yes --> Ident{"Identity known from session agent and latest user message"}
  Ident -- no --> Fail409["409 with code"]
  Ident -- yes --> Idem{"Existing rules end with the exact target suffix"}
  Idem -- yes --> Skip["No PATCH, ruleset does not grow"]
  Idem -- no --> ModeQ{"Which mode"}
  ModeQ -- Plan --> Patch["Single PATCH session permission rules"]
  ModeQ -- Build --> Denial{"hasPlanDenial finds last pattern star rule denying"}
  Denial -- no --> Skip
  Denial -- yes --> Patch
  Skip --> Submit["submitPromptAsync, never sends tools"]
  Patch --> Submit
```

### The event path

One upstream subscription is created at boot (`server/index.ts:53`, started at `:74`), before any
route is reachable and independent of whether a browser is connected.

The supervisor loop is `server/opencode/events.ts:66-94`. Backoff runs from 1,000 ms to 30,000 ms
(`:39-40`), doubling at `:92`, resetting on a clean stream end at `:83` and on a successful
connect at `:107`, and retrying **forever**. `connect()` (`:96-127`) uses plain `fetch` with
`Accept: text/event-stream` and hand-parses frames on `\n\n` with a streaming `TextDecoder`;
there is no `EventSource` polyfill on the server, and **no `Last-Event-ID`** is ever sent.
`handleFrame` (`:129-153`) parses inside a `try` that returns silently on malformed input,
unwraps `envelope.payload ?? envelope` so that both the `/global/event` envelope shape and bare
`/event` frames work, and drops frames with no `type`. `setMaxListeners(0)` at `:59` exists
because many tabs attach listeners to the same bus.

Browser fan-out is `server/routes/sessions.ts:730-761`. The response sets
`text/event-stream`, `no-cache, no-transform`, `keep-alive` and `X-Accel-Buffering: no`, then
writes a synthetic `connected` frame first. One `bus.on("event")` closure is registered per
connection and removed on `req.on("close")` along with the keep-alive timer. A 15-second
`: keep-alive` comment (`:755`) is sent deliberately independent of upstream's own 10-second
`server.heartbeat`, because the BFF may be filtering all upstream traffic out for this
subscriber (`:753-754`). No `retry:` field is ever sent, so browsers use their own default.

**Backpressure is not handled.** The return value of `res.write` is discarded at `:749` and
`:755`, and there is no `drain` listener, no queue cap and no slow-client eviction. A stalled TCP
peer accumulates frames in Node's socket write buffer for as long as it stays connected. This is
carried forward as a risk.

The bus is not upstream-only. The notification service re-emits into it
(`server/notifications/service.ts:416-420`, `:535-539`), so `/api/events` carries a union of
upstream OpenCode events and BFF-synthetic events.

Demultiplexing happens in three layers.

The first is the BFF filter at `server/routes/sessions.ts:743`, written as
`if (scope && event.directory && event.directory !== scope)`. An event with **no** directory is
therefore forwarded to every scoped subscriber, which is exactly what lets BFF synthetics through
and is why the client filters again. The second is the client's own scope check plus a session-id
refilter (`client/lib/useSessionStream.ts:225`, `:248-249`). The third is deliberate absence:
`useNotifyWatcher` subscribes unscoped (`client/lib/useNotifyWatcher.ts:85`) because
notifications are cross-project.

Unknown event types are tolerated at every layer. `server/opencode/events.ts:157-159` states the
reason: filtering there would mean a server upgrade silently breaks a feature. On the client the
entire handler body sits inside a `try/catch` (`client/lib/useSessionStream.ts:274-276`),
`server.heartbeat` is explicitly dropped (`:246`), and unknown types fall through to a harmless
poll (`:273`). The adapter drops unknown `Part.type` values and treats an unknown tool status as
`running` rather than discarding the tool entirely (`client/lib/events.ts:366-378`, `:517-521`).
No reducer throws.

The hook header at `client/lib/useSessionStream.ts:1-17` states the contract: two channels
deliberately, a 3-second poll that is the durable source of truth and an SSE subscription that
only says "something changed, poll now". The stream never carries transcript content, so if it
drops the UI degrades to exactly its pre-SSE behaviour instead of showing a divergent view.
Because browsers cap HTTP/1.1 at roughly six connections per origin, the stream opens only when
the tab is visible (`:224`). Backoff is 2, 4, 8, 16, 30 seconds (`:40-42`). `onerror` closes the
source itself (`:278-283`), because the browser's built-in infinite retry turned a server restart
into a pool-exhausting storm in the predecessor (`:12-15`). The retry counter resets on a valid
application frame rather than a TCP open (`:231-233`), on visibility change (`:288`), and on a
`window online` event (`:295-300`).

Refetch-on-reconnect is `client/lib/useSessionStream.ts:234-245`: the synthetic `connected` frame
hard-invalidates every backfilled page, bumps the history generation and resets cursors. There is
no replay cursor anywhere in the system — `Last-Event-ID` is never sent, and the BFF never emits
an `id:` field — so replacing state is the only correct recovery.

One divergence is worth reporting rather than hiding. The second `EventSource`, in
`useNotifyWatcher` (`client/lib/useNotifyWatcher.ts:85`), has **no `onerror`, no backoff, and no
visibility gating**. It relies on browser-default infinite retry, which is precisely the
behaviour `client/lib/useSessionStream.ts:12-15` records as a past outage, and it never closes on
tab hide, so a background tab holds a connection open indefinitely.

```mermaid
flowchart LR
  OC["opencode serve"] -->|"GET /global/event, no replay cursor"| Sup["Event supervisor, retries forever"]
  Sup -->|"unwrap payload, drop typeless"| Bus["EventBus, setMaxListeners zero"]
  Notif["NotificationService synthetics"] -->|"re-emit"| Bus
  Bus --> F1["Filter: scope and event.directory"]
  Bus --> F2["Filter: scope and event.directory"]
  Bus --> F3["Filter: scope and event.directory"]
  F1 --> T1["Tab A, scoped, 15s keep-alive"]
  F2 --> T2["Tab B, scoped, 15s keep-alive"]
  F3 --> T3["Notify watcher, unscoped"]
  T1 -->|"something changed, poll now"| Poll["3s durable poll"]
  T2 -->|"something changed, poll now"| Poll
```

### The transcript adapter seam

`client/lib/transcript.ts` is labelled the frozen contract at `:3`, with the rule at `:6-7` that
no React component may import OpenCode SDK types or touch a raw `Part`. The event union at
`:155-162` is `UserEvent | AgentEvent | ThoughtEvent | ToolEvent | PatchEvent | StatusEvent |
ErrorEvent`. `UsageSnapshot` and `InterruptedState` are deliberately out-of-band values rather
than rows, because neither belongs at a position in the transcript. `MessageMode` is re-declared
at `:35` rather than imported, because importing it would place a backend-aware module on the
frozen contract's import graph (`:26-34`).

Mapping is one switch, at `client/lib/events.ts:382-522`. A `file` part maps to `null` and is
folded into the adjacent turn as an attachment rather than becoming a row of its own. A
turn-level `info.error` appends an extra error event **after** the parts, which preserves both
the partial work and the failure (`:589-601`). Patch metadata is bounded to 8 files, 240 path
characters and 1,200 aggregate characters, with `filesTruncated` reported honestly (`:91-95`).

Hand-back detection (`client/lib/events.ts:292-310`) requires all three of a `ses_` session id, a
delegation word and an outcome word, and tests failure first so that "failed to complete" is not
read as success. A spurious success is the expensive direction to be wrong in.

Reconciliation has two layers. Page-level identity is `message:<info.id>`, then `parts:<ids>`,
then `unknown:<JSON>` (`client/lib/messagePages.ts:11-17`), and a response with
`nextCursor === null` is treated as authoritative, clearing stale rows (`:41-60`). Event-level
fingerprints (`client/lib/derive.ts:25-42`) **include mode for both prose kinds**; the reason is
recorded at `:21-23`: a first sight of a message can lack the metadata that classifies it, and
without mode in the fingerprint a later authoritative fetch would leave the row rendering neutral
forever. `mergeEvents` (`:50-76`) returns the same array reference when nothing changed, so memo
boundaries survive a poll.

Mode provenance is `client/lib/events.ts:328-364`, and its precedence is exact. A user message is
classified solely from an exactly recognised `info.agent`, and `info.mode` is deliberately not
consulted. An assistant turn prefers `info.mode` with `info.agent` as fallback, so a recognised
mode classifies the row even when the naming agent is internal or a sub-agent. Two recognised
values that disagree yield nothing. An unrecognised `info.mode` is an unknown label, is not
disqualifying, and falls through to the identity. Nothing is inherited from a neighbour, a
parent, or the session. Only user and assistant prose carries the treatment. The docstring at
`:347-349` notes that the live fixture only ever pairs `info.mode` with an agreeing `info.agent`,
so this ordering is a forward-compatibility choice rather than an observed behaviour. The pill is
provenance and not a policy guarantee: a child session can report Build while still carrying a
parent's historical Plan denies, so a Build pill never proves the turn could mutate anything.

### State ownership

| State | Owner | Persistence |
|---|---|---|
| Sessions, messages, todos, sharing | OpenCode | OpenCode storage |
| Notification history and resolution | BFF | `.state/notification-history.json` |
| Auto-permissions toggle | BFF | Memory only; defaults off after restart (`server/opencode/autoPermissions.ts:20`, `:77`) |
| Git worktrees and repository state | Host | Local filesystem and Git |
| Global event subscriptions | BFF | Process lifetime |
| Sub-agent state | BFF | Derived per request; never stored |

`docs/architecture.md:92-100` is correct but incomplete. The rows it omits are these:

| State | Owner | Persistence |
|---|---|---|
| Project pins | BFF | `.state/project-pins.json` (`server/projects.ts:156`), file mode 0600, directory 0700 |
| Model pins | BFF | Persisted, capped at 20 |
| Notification preferences | BFF | Persisted |
| Web Push subscriptions | BFF | Persisted, capped at 32, file mode 0600 |
| Instruction audit | BFF | Persisted, capped at 500 records |
| Managed-child launch idempotency map | BFF | Memory, capped at 500 (`server/opencode/sessions.ts:956-957`) |
| Prompt mutex map | BFF | Memory, per Node process |
| Model catalogue cache | BFF | Memory, 15-second time to live (TTL) |
| Capability cache | BFF | Memory, 30-second TTL |
| Planning caches | BFF | Memory, 60-second and 5-minute TTLs |

Browser-owned state is entirely in `localStorage`; `sessionStorage` is used nowhere.

| Key | Contents |
|---|---|
| `opencode.directory.v1` | Selected project directory (`client/lib/palette.ts:3`) |
| `opencode.recentSessions.v1` | Recent session list, capped at 50 |
| `opencode.wrapOutput.v1` | Output wrapping preference |
| `opencode.planning.view` | Planning view selection |
| `opencode.planning.density` | Planning row density |
| `opencode-notification-media-v1` | Device-local notification sound and speech settings |
| `opencode-notification-view-v1` | Notification inbox filters |
| `theme` | Light or dark selection |

Two inconsistencies are worth recording. `opencode.directory.v1` is exported as a constant from
`client/lib/palette.ts:3` but duplicated as a bare string literal in `client/pages/Hub.tsx:36`
and `client/pages/Tools.tsx:8` rather than imported, so a rename would need three edits. And the
key names mix dot-versioned (`opencode.directory.v1`) with hyphen-versioned
(`opencode-notification-media-v1`) conventions, with `theme` unversioned entirely.
