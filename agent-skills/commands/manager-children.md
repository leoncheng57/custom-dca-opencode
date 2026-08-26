---
description: Dispatch isolated OpenCode workers and manage their PR wave
agent: build
---

Manage `$ARGUMENTS` through separate OpenCode workers in sibling git worktrees
and unfocused CMUX workspaces.

Before dispatch:

1. Load the `manager-children` skill and follow its continuation contract.
2. Write a durable wave plan with ownership, dependencies, integration order,
   and final verification.
3. State explicitly that standalone children continue after this turn but do
   not automatically resume the manager.
4. Create one worktree and branch per disjoint assignment from the current
   remote default branch.
5. Require status files, heartbeats, verified commits, pushed branches, and PRs.

Use the manager skill's resume and merge gates. Never busy-wait, scrape child
screens as the primary monitor, push the default branch from a child, or claim
that a CMUX notification is an OpenCode callback.
