---
title: A child gets its own worktree before it can edit anything
trigger: give the child its own worktree
caveat: >-
  Shows the preflight and the launch prompt boundary; the child's own guard
  output and final report are not shown here.
---

# Worked example

## user

Delegate the notification badge fix to a Task child. Give the child its own
worktree so it can't touch what I'm editing here.

## tool — bash

```
$ git branch --show-current
main
$ git status --short
 M client/pages/Hub.tsx
```

## assistant

This parent session is a fresh Build-only session with no prior Plan
activation, so it can delegate safely. I'm creating a sibling worktree from
`origin/main` at `../custom-dca-opencode.worktrees/notification-badge` on
branch `fix/notification-badge`, then launching the child with:

```
task(
  description   = "Fix notification badge count",
  subagent_type = "general",
  prompt        = "Absolute worktree: /Users/x/custom-dca-opencode.worktrees/notification-badge
                    on branch fix/notification-badge. Edit only inside that path — never the
                    parent checkout at /Users/x/custom-dca-opencode. Every Bash call must set
                    workdir to the worktree path. Before editing, tests, commit, or push, run:
                    pwd; git rev-parse --show-toplevel; git status --short --branch — and stop
                    without mutating anything unless both equal the assigned worktree. Own
                    client/components/notification-badge.tsx and its test only. Do not touch
                    client/pages/Hub.tsx, which I am editing here. Verify with
                    npm test -- --run tests/notification-events.test.ts, then commit and push
                    the branch. Report the diff summary and test result."
)
```

## note

The prompt states the absolute worktree, the branch, the exact file it owns,
the file it must not touch, the required preflight guard, and the verification
command — because a fresh Task child sees only this string, not the
conversation above it.
