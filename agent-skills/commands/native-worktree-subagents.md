---
description: Delegate disjoint edits to native Task children in sibling worktrees
agent: build
---

Delegate `$ARGUMENTS` only after confirming a fresh Build-only parent and a
dedicated sibling worktree from fresh `origin/main`. A parent that previously
activated Plan may pass historical denies to children even after its own Build
tools return. If the child cannot pass preflight, stop; never weaken policy or
substitute an unrelated root session.

The child remains scoped to the parent's OpenCode directory. External-directory
permission does not change relative path resolution, shell CWD, LSP/VCS scope,
or event directory. Its cold-start prompt must require:

1. The absolute worktree path and branch, with edits allowed only there.
2. Every Bash call setting `workdir` there or using `git -C <absolute-path>`.
3. Every read, edit, and patch using an absolute path inside the worktree.
4. Exclusive file ownership, non-goals, exact verification, commit/push rules,
   and the final report.
5. This guard before edits, tests, commit, and push:

       pwd
       git rev-parse --show-toplevel
       git status --short --branch

The child must stop without mutation unless both `pwd` and Git top-level equal
the assignment. Never fall back to the parent checkout, force-push, or push the
default branch. Parallel children must not share a lockfile, migration, port,
database, generated artifact, or integration file. Review the diff and checks
at hand-back before presenting or merging it, and never duplicate its work.

| Failure | Response |
|---|---|
| Child resolves paths in the parent checkout | Stop and relaunch with absolute containment rules |
| Tool remains denied in Build | Use a fresh Build-only parent; do not weaken rules |
| Separate branches still conflict | Sequence shared ownership or give it to one owner |
| Hand-back is unclear | Fix the prompt's deliverable and verification contract before launch |
