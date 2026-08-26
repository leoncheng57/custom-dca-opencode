---
title: One line in, a baselined worktree out
trigger: /worktree-up
caveat: >-
  The npm ci step really takes minutes, and the orient commands are collapsed
  into one block. The command stops at the report; it does not start work.
---

# Worked example

## user

/worktree-up dark-mode

## tool — bash

```
$ git rev-parse --show-toplevel && git rev-parse --abbrev-ref origin/HEAD
/Users/you/Documents/Projects/app
origin/main
$ git fetch origin
$ git worktree add -b feat/dark-mode ../app.worktrees/dark-mode origin/main
Preparing worktree (new branch 'feat/dark-mode')
$ cd ../app.worktrees/dark-mode && npm ci && npm run typecheck && npm test
Tests  214 passed (214)
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
(none)
```

## assistant

```
  path:     /Users/you/Documents/Projects/app.worktrees/dark-mode
  branch:   feat/dark-mode (from origin/main @ a1b2c3d)
  deps:     installed (npm ci)
  baseline: typecheck + 214 tests green
  ports:    3000 free
```

Ready. I have not written any code in it.

## note

`$ARGUMENTS` carried `dark-mode` straight into the template, which is the whole
reason this is a command rather than a skill — a skill cannot take input.

The template is the happy path only. The moment something goes wrong — a stale
worktree registration, a branch already checked out elsewhere, a sibling
worktree holding the port — the last line of the command sends the agent to the
`worktree-up` skill for the failure-mode table. The command deliberately does
not restate it, because two copies of a failure-mode table drift.
