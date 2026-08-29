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

`$ARGUMENTS` carried `dark-mode` straight into the template, so the same command
can create a specifically named worktree without permanent retrieval context.

The template also owns the failure paths: stale registration, a branch already
checked out elsewhere, and a sibling worktree holding the port. One complete
command avoids a second source that could drift.
