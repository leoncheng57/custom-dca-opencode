---
description: Create an isolated worktree for new work
agent: build
---

Create a git worktree for "$ARGUMENTS" now.

1. Find the repository root and origin's default branch. Run `git fetch origin`
   before branching; start from `origin/<default>`, never a stale local branch.
2. Create the worktree beside the repository at
   `<repo>.worktrees/<topic>`, on branch `<type>/<topic>`. Use kebab-case and
   include the issue number when one exists.
3. Install dependencies in the new worktree because gitignored directories such
   as `node_modules` and `.venv` are not shared.
4. Copy required gitignored local configuration such as `.env`; make any paths
   inside it absolute when they refer back to state in the original checkout.
5. Establish a green baseline with the repository's typecheck, tests, and build
   before writing code.
6. Before starting anything on fixed ports, run
   `lsof -nP -iTCP:<port> -sTCP:LISTEN` and confirm the owning PID. Only one
   worktree may run a fixed-port stack at a time.
7. Report the absolute worktree path, branch, base revision, dependency status,
   baseline result, and any port conflict.

If creation is blocked by a stale registration, a branch already checked out,
or a sibling stack, consult the `worktree-up` skill for the full failure-mode and
cleanup procedures. Do not work around Git's worktree safety checks.
