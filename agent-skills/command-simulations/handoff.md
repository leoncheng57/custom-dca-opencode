---
title: A prompt written off-context
trigger: /handoff
caveat: >-
  The generated prompt is abbreviated to its section headers; a real one runs to
  two or three hundred lines. It stops before launching anything.
---

# Worked example

## user

/handoff the saved-filters feature

## tool — bash

```
$ git rev-parse --show-toplevel && git branch --show-current && git status --short
/Users/you/Documents/Projects/app
feat/saved-filters
```

## assistant

Written to `/Users/you/Documents/Projects/app.worktrees/prompts/saved-filters.md`:

```
Branch feat/saved-filters is checked out at <abs path>, deps installed,
typecheck + 214 tests green at baseline.

PRE-RESEARCHED - DO NOT RE-DERIVE:
- Filter state lives in client/issues/FilterBar.tsx:40, useState only.
- NO persistence primitive for per-user UI state exists. You are building
  the first one. Do not go looking for it.

DECIDED: per-user, not per-team. Rationale: no membership table exists yet
(db/schema.sql), so per-team would need one first.

GOTCHA: a setting key absent from server/config/settings.ts:64 is accepted
by the API and silently ignored at runtime.

OUT OF SCOPE (list as follow-ups in the PR body, do not build):
- Sharing a filter with another user - needs the team model.

SHARED-RESOURCE RULE: sibling worktree ../webhook-secrets on branch
feat/webhook-secrets. docker compose binds 8010 and 3210 and bind-mounts
./.state - only ONE worktree may run the stack. Check docker ps first.

Verify: npm run typecheck && npm test && npm run build
```

Read it before I launch anything.

## note

`subtask: true` in the frontmatter is doing the heavy lifting. Compiling this
prompt means re-reading a lot of the repository, and all of that reading happened
in a subagent — the parent session got back one file path and the finished text
instead of thirty tool results.

That is the strongest argument for a command over a skill in a long session:
the expensive part runs somewhere else and never touches the context you are
trying to preserve.

The command stops before firing. Showing the prompt is the last cheap moment to
correct scope.
