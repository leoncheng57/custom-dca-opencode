---
description: Delegate disjoint edits to native Task children in sibling worktrees
agent: build
---

Delegate `$ARGUMENTS` only after confirming a fresh Build-only parent and a
dedicated sibling worktree from fresh `origin/main`. Give each child an absolute
worktree path, exclusive file ownership, exact verification, and the required
preflight guard before it edits anything.

For inherited Plan denies, containment rules, parallel-ownership limits, and
the failure-mode table, load the `native-worktree-subagents` skill.
