---
title: Two features researched, then handed off
trigger: research these with subagents
caveat: >-
  Phase 1 takes minutes and one handoff prompt is shown as a skeleton rather
  than in full — a real one runs to two or three hundred lines. Both user
  checkpoints are shown; neither may be skipped, and this transcript stops at
  the second one rather than showing the launch.
---

# Worked example

## user

Two things I want built: a saved-filters feature for the issue list, and
per-project webhook secrets. They don't overlap. Research these with subagents
and get me prompts I can hand to two agents.

## tool — task

```
task(subagent_type="explore", description="Research saved filters", prompt="
  READ-ONLY RESEARCH. Do not write or edit any files.
  ...
  7. What does NOT exist yet? List the gaps explicitly.
  Cite file:line for every claim. READ-ONLY.
")

task(subagent_type="explore", description="Research webhook secrets", prompt="
  READ-ONLY RESEARCH. Do not write or edit any files.
  ...
  Another agent covers the issue list; do not read client/issues/.
  Cite file:line for every claim. READ-ONLY.
")
```

## assistant

Both back. The load-bearing findings:

**Saved filters.** No persistence primitive for per-user UI state exists —
`client/issues/FilterBar.tsx:40` holds filter state in `useState` and nothing
writes it anywhere. This is the first one, not a variation on an existing
pattern.

**Webhook secrets.** `server/webhooks/verify.ts:22` already reads a single
`WEBHOOK_SECRET` from the environment and is called from three routes. Making
it per-project is a signature change across all three, not a new module.

Two gotchas worth naming now, because both are silent:

- `server/config/settings.ts:64` has an allow-list. A new setting key that is
  not added there is accepted by the API and then ignored at runtime.
- The test runner is `environment: node`. Component rendering in a spec fails
  in a way that looks like a component bug.

## tool — bash

```
$ git worktree prune && git fetch origin
$ WT=~/Documents/Projects/app.worktrees
$ git worktree add -b feat/saved-filters    $WT/saved-filters    origin/main
$ git worktree add -b feat/webhook-secrets  $WT/webhook-secrets  origin/main
$ (cd $WT/saved-filters   && npm ci && npm run typecheck && npm test) &
$ (cd $WT/webhook-secrets && npm ci && npm run typecheck && npm test) &
$ wait
saved-filters    : 214 passed (214)
webhook-secrets  : 214 passed (214)
$ mkdir -p $WT/prompts   # outside every working tree, so no worktree starts dirty
```

## assistant

Prompts written to `$WT/prompts/saved-filters.md` and
`$WT/prompts/webhook-secrets.md`. Here is the first, abbreviated — read it
before I fire anything, this is the last cheap moment to correct scope:

```
Branch feat/saved-filters is checked out at <path>, deps installed,
typecheck + 214 tests + build green at baseline.

Read first: AGENTS.md, client/README.md

PRE-RESEARCHED - DO NOT RE-DERIVE:
- Filter state lives in client/issues/FilterBar.tsx:40, useState only.
- NO persistence primitive for per-user UI state exists anywhere. You are
  building the first one. Do not go looking for it.
- Settings are read via server/config/settings.ts:64 (allow-list).

DECIDED: per-user, not per-team. Rationale: the team model has no membership
table yet (verified, db/schema.sql), so per-team would need one first.

GOTCHA: a setting key absent from the settings.ts:64 allow-list is accepted
by the API and silently ignored at runtime.
GOTCHA: test runner is environment: node - NO component rendering in specs.

OUT OF SCOPE (list as follow-ups in the PR body, do not build):
- Sharing a saved filter with another user - needs the team model.

SHARED-RESOURCE RULE: another agent is working in a sibling worktree at
../webhook-secrets on branch feat/webhook-secrets. docker compose up binds
fixed ports (8010, 3210) and bind-mounts ./.state - only ONE worktree may
run the stack at a time. Tiers 1-3 (typecheck/test/build) need no stack.
Before running e2e or docker compose up, check docker ps and lsof -i :8010
and do not start a second one.

Verify: npm run typecheck && npm test && npm run build
```

Two things to decide before I launch:

1. **Plan mode or not?** Launched this way both agents start editing
   immediately. Should they present a plan first?
2. **PR or local commit?** As written both prompts push a branch and open a PR.

## note

The transcript stops here on purpose. The skill has two mandatory user
checkpoints — the prompts are shown before anything fires, and the plan-mode
and PR-versus-commit questions are asked — and running straight through them
would advertise an autonomy the skill deliberately withholds.

The prompt is decision-closed. It states what was decided *and why*, so the
receiving agent does not relitigate it, and it carries the negative finding
("NO persistence primitive exists anywhere — you are building the first one")
which is as expensive to establish as any positive one and is what agents most
often get wrong.

The `SHARED-RESOURCE RULE` names the sibling worktree, its branch, the exact
ports, and the check to run. Both prompts get it, not just one.

Prompt files live in `$WT/prompts/`, outside every working tree, so neither
worktree starts dirty. Arrows are plain ASCII because the text passes through
a shell and a terminal emulator on its way to the agent.
