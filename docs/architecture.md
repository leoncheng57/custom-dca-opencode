# Architecture

custom-dca-opencode is a host-native web client for one long-lived OpenCode server. It adds a
mobile-friendly interface, notifications, local Git and forge context, and operational controls
without replacing the OpenCode CLI.

## System topology

```text
Browser (desktop or phone over Tailscale)
  |
  v
React 19 + Vite SPA
  |
  | same-origin HTTP and SSE
  v
Express BFF
  |-- OpenCode credential, directory validation, SSE fan-out
  |-- local Git and GitHub/GitLab integrations
  |-- notification history and ntfy delivery
  |-- constrained localhost preview proxy
  |
  v
opencode serve :4096
  |-- one process for every project
  |-- sessions selected with ?directory=<absolute path>
  `-- agent tools execute on the host as the current user
```

The browser never talks directly to OpenCode or a forge. The BFF is the credential and trust
boundary, and all browser-facing APIs remain same-origin.

## Conversation lifecycle

1. The client selects a project with an absolute `directory` query parameter.
2. The BFF canonicalizes that path beneath `PROJECTS_DIR` or `OPENCODE_WORKTREE_ROOT`.
3. The client creates or opens an OpenCode session scoped to that directory.
4. Before each prompt, the BFF activates the selected Plan or Build policy on the session.
5. The BFF sends the prompt through `POST /session/{id}/prompt_async` and returns immediately.
6. OpenCode continues the turn even when every browser disconnects.
7. One upstream `GET /global/event` stream is fanned out to browsers and demultiplexed by its
   `directory` field.
8. Reconnecting clients refetch session state because the classic event stream has no replay
   cursor.

The blocking `POST /session/{id}/message` route is never used by a UI request because it holds
the HTTP connection for the entire agent turn.

## Data boundaries

Raw OpenCode response and event shapes cross the application at two deliberate seams:

- `server/opencode/client.ts` is the typed fetch boundary. The live OpenCode `GET /doc` response
  is the contract when published documentation or SDK types disagree.
- `client/lib/events.ts` converts OpenCode message parts into backend-neutral
  `TranscriptEvent` values. Transcript rows do not consume raw OpenCode `Part` objects.

That separation keeps transport churn out of the UI and made the migration from the OpenHands
backend an adapter rewrite instead of a transcript rebuild.

## State ownership

| State | Owner | Persistence |
|---|---|---|
| Sessions, messages, todos, sharing | OpenCode | OpenCode storage |
| Selected project and device preferences | Browser | `localStorage` |
| Notification history and resolution | BFF | `.state/notification-history.json` |
| Auto-permissions toggle | BFF | Memory only; off after restart |
| Git worktrees and repository state | Host | Local filesystem and Git |
| Global event subscriptions | BFF | Process lifetime |

## Safety boundary

OpenCode tools run directly on the host as the user running `opencode serve`; there is no
container boundary. The primary guardrail is the permission policy in `opencode.jsonc`.
Permission matching is last-match-wins, so broad rules come before specific overrides.

The BFF adds narrower boundaries around browser-controlled input:

- Workspace paths are canonicalized beneath configured roots before filesystem access.
- OpenCode and forge credentials remain server-side.
- The preview proxy accepts only explicitly allowlisted localhost ports and strips sensitive
  request headers.
- Plan/Build policy activation and prompt submission are serialized per directory and session.
- Unknown event types are tolerated because the global stream contains events outside the
  typed client union.

## Extension map

| Change | Start here | Preserve |
|---|---|---|
| OpenCode endpoint or payload | `server/opencode/client.ts` | Directory scoping and the live `/doc` contract |
| Transcript rendering | `client/lib/events.ts` | Backend-neutral `TranscriptEvent` rows |
| New BFF route | `server/routes/` | Credential isolation and path validation |
| New page or primitive | `client/pages/`, `client/ds/` | Semantic tokens and deterministic test IDs |
| Notifications | `server/notifications.ts`, `client/lib/useNotificationCenter.tsx` | Manual-only resolution semantics |
| Preview behavior | `server/preview.ts` | Port allowlist and stripped credentials |
| Deployment | `deploy/README.md`, `scripts/launchd.ts` | One supervised BFF and one existing OpenCode server |

## Verification architecture

Vitest covers pure behavior in a Node environment. Playwright builds the production SPA and BFF,
then runs them against deterministic OpenCode, forge, and preview mocks. End-to-end tests require
no live agent, model, or credentials.

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

See [Contributing](../CONTRIBUTING.md), the [OpenCode API audit](opencode-1.18.21-api-audit.md),
and the [architecture research](research/README.md) for the workflow and evidence behind these
boundaries.
