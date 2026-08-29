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

Do not work around Git's worktree safety checks. If `origin/HEAD` is unset, run
`git remote set-head origin --auto` and re-read it. If the branch exists, omit
`-b`; if it is checked out elsewhere, find and use that worktree instead.

Worktrees must be siblings, never nested under the clone. On cleanup, inspect
for uncommitted work before `git worktree remove`; use `--force` only when that
work is explicitly disposable. Run `git worktree prune` for registrations whose
directories were deleted outside Git.

| Failure | Response |
|---|---|
| New branch is already behind | Fetch and recreate it from the remote default branch |
| Branch is already checked out | Use `git worktree list`; do not bypass the refusal |
| New worktree commands fail immediately | Install its own dependencies |
| App has no local config | Copy required ignored config and fix relative paths |
| Server behaves like another branch | Verify the listening PID and its worktree |
| Two stacks share writable state | Stop one stack; use stack-free verification tiers |
| Deleted path remains registered | Prune stale worktrees, then confirm the list |
