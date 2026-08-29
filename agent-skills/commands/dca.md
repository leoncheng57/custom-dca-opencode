---
description: Operate DCA sessions through the native BFF API
agent: build
---

Use DCA's BFF API for `$ARGUMENTS`. This is the agent-facing HTTP workflow for
creating, prompting, and observing sessions. It is distinct from issue #216's
human-only composer workflow: that UI asks a human to review and launch a
session, while this command calls already-authorized BFF endpoints directly.

First establish the boundary:

1. Set `DCA_BASE_URL` to the deployment's canonical BFF origin, without a
   trailing slash. Do not assume `127.0.0.1`, a port, or even that loopback is
   reachable from this shell. A remote, containerized, sandboxed, or phone-side
   shell may need a private DNS/Tailscale URL or may have no route at all.
2. Use the deployment's existing authentication mechanism. The examples below
   omit auth headers; that is valid only for a private deployment that actually
   has no app-level auth. Never invent a token or put a secret in a tracked file.
3. Confirm network access and upstream health before creating anything:

```bash
: "${DCA_BASE_URL:?Set DCA_BASE_URL to the reachable DCA BFF origin}"
curl -sS --fail-with-body "$DCA_BASE_URL/api/health" | jq .
```

`healthy: true` proves the BFF answered. Also inspect `upstream.reachable`,
`upstream.versionMatches`, and `events.connected`; do not flatten those distinct
signals into one claim.

Use an absolute project path and URL-encode it. List root sessions:

```bash
PROJECT=/absolute/path/to/project
curl -sS --fail-with-body --get "$DCA_BASE_URL/api/sessions" \
  --data-urlencode "directory=$PROJECT" \
  --data-urlencode "roots=true" \
  --data-urlencode "limit=50" | jq .
```

Create a root and submit its first prompt in one request. `mode` is `plan` or
`build`; the server validates any `model` and optional isolated worktree fields.

```bash
BODY=$(jq -n \
  --arg directory "$PROJECT" \
  --arg title "Investigate flaky export test" \
  --arg prompt "Diagnose the flaky export test. Do not edit files; report evidence." \
  '{directory:$directory,title:$title,prompt:$prompt,mode:"plan"}')
CREATED=$(curl -sS --fail-with-body -X POST "$DCA_BASE_URL/api/sessions" \
  -H 'Content-Type: application/json' -d "$BODY")
SESSION_ID=$(jq -er '.session.id' <<<"$CREATED")
printf '%s\n' "$SESSION_ID"
```

For an existing session, submit a prompt asynchronously. HTTP `202` and
`{"accepted":true}` mean accepted, not completed:

```bash
KNOWN_ASSISTANTS=$(curl -sS --fail-with-body --get \
  "$DCA_BASE_URL/api/sessions/$SESSION_ID/messages" \
  --data-urlencode "directory=$PROJECT" --data-urlencode "limit=100" \
  | jq -c '[.messages[]? | select(.info.role == "assistant") | .info.id]')
BODY=$(jq -n --arg directory "$PROJECT" --arg text "Continue and verify the fix." \
  '{directory:$directory,text:$text,mode:"build"}')
curl -sS --fail-with-body -X POST \
  "$DCA_BASE_URL/api/sessions/$SESSION_ID/prompt" \
  -H 'Content-Type: application/json' -d "$BODY" | jq .
```

Poll messages with the same directory until the submitted turn has a completed
assistant response and `running` is false. Responses contain raw OpenCode
`{info,parts}` messages, plus `nextCursor` and `running`; inspect the payload
rather than guessing a fixed array position. Use `before=<nextCursor>` for older
pages and keep `limit` between 1 and 100.

```bash
while :; do
  PAGE=$(curl -sS --fail-with-body --get \
    "$DCA_BASE_URL/api/sessions/$SESSION_ID/messages" \
    --data-urlencode "directory=$PROJECT" --data-urlencode "limit=100") || exit
  jq '{running, messages}' <<<"$PAGE"
  # Stop only after identifying this turn's completed assistant message.
  jq -e --argjson known "$KNOWN_ASSISTANTS" '.running == false and
    any(.messages[]?; .info.role == "assistant" and
      .info.time.completed != null and
      (.info.id as $id | ($known | index($id)) == null))' \
    >/dev/null <<<"$PAGE" && break
  sleep 3
done
```

Use a Managed Child instead of a root when parent/child accounting, inherited
project scope, child status, or parent-scoped abort authority matters. Query the
server-owned agent catalogue first. Read-only agents reject `authorization`;
agents whose catalogue entry has `access: "can-modify"` require the explicit
`authorization: "modify"` field. The idempotency key must be stable for a retry
of the same launch and unique for different work.

```bash
PARENT_ID=ses_parent
curl -sS --fail-with-body --get "$DCA_BASE_URL/api/managed-child-agents" \
  --data-urlencode "directory=$PROJECT" | jq .

KEY="audit-export-$(date -u +%Y%m%dT%H%M%SZ)"
BODY=$(jq -n --arg directory "$PROJECT" --arg key "$KEY" \
  --arg prompt "Audit export error handling and report findings with file lines." \
  '{directory:$directory,prompt:$prompt,agent:"explore",idempotencyKey:$key}')
CHILD=$(curl -sS --fail-with-body -X POST \
  "$DCA_BASE_URL/api/sessions/$PARENT_ID/managed-children" \
  -H 'Content-Type: application/json' -d "$BODY")
CHILD_ID=$(jq -er '.session.id' <<<"$CHILD")
```

The creation request submits the Managed Child's initial prompt. Poll the child
through `/api/sessions/$CHILD_ID/messages`; later prompts use the ordinary
`/api/sessions/$CHILD_ID/prompt` route, which re-verifies its managed
configuration. Inspect parent accounting with
`GET /api/sessions/$PARENT_ID/subagents?directory=...`. Abort a verified child
with `POST /api/sessions/$PARENT_ID/subagents/$CHILD_ID/abort` and the directory
in the JSON body; do not use abort as routine completion handling.

Useful read surfaces are `GET /api/sessions/:id`, `todos`, `diff` with a
`userMessageID`, `/api/session-agents`, `/api/models`, and `/api/events` for SSE.
Sharing, deleting, auto-approval, aborting, isolated worktree creation, and
modify-capable Managed Children are mutations or privilege-bearing operations;
call them only when the user's request and current permissions authorize them.

Prefer this BFF API over cmux for DCA session lifecycle. cmux is optional
presentation or orchestration only when its app, CLI/socket access, and current
environment are actually available; it is not a transport fallback and this
command never assumes it exists.
