---
name: native-worktree-subagents
title: Native Worktree Subagents
description: Run mutating OpenCode Task children in isolated sibling worktrees while preserving parent/child session behavior.
tags: worktrees, subagents
---

Use native Task subagents so delegated work retains `parentID`, sidebar visibility, foreground/background behavior, and result hand-back. Give each mutating child a separate sibling Git worktree and branch created from fresh `origin/main`.

Before launching, confirm the parent is a fresh Build-only session. A parent that previously activated Plan can carry historical deny rules into new children even after Build restores the parent's own tools. If a child cannot run the preflight below, stop instead of substituting an independent root session.

The child session still belongs to the parent's OpenCode directory. External-directory permission grants file access; it does not change relative-path resolution, default shell CWD, LSP/VCS/snapshot scope, or event directory. Therefore every child prompt must include:

- The exact absolute worktree path and branch.
- A statement that edits are allowed only inside that path.
- A requirement that every Bash call sets `workdir` to that path or uses `git -C <absolute-path>`.
- A requirement that every read, edit, and patch uses an absolute path inside the worktree.
- Explicit file ownership, non-goals, verification commands, commit/push instructions, and the required report.

Require this guard before edits, tests, commit, and push:

```bash
pwd
git rev-parse --show-toplevel
git status --short --branch
```

The child must stop without mutation unless both `pwd` and the Git top-level equal the assigned worktree. It must never fall back to the parent checkout, weaken filesystem permissions, force-push, or push the default branch.

Launch native Task children in parallel only when their file ownership and shared resources do not overlap. Prefer background Task children when the parent can continue without their result. After launch, do not duplicate their work. Review every child diff and verification result before presenting or merging its PR.
