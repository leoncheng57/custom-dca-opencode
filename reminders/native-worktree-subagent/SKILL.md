---
name: native-worktree-subagent
title: Delegate in an Isolated Worktree
description: Run a native Task child in an assigned sibling worktree while preserving parent-child semantics and guarding every mutating phase.
---

Use the native Task tool so OpenCode preserves the child `parentID`, sidebar visibility, foreground/background behavior, and result hand-back. The parent must first fetch the remote and create one sibling worktree per mutating child from fresh `origin/main`, then launch in Build mode. Do not replace the Task child with an independent root session.

The child session directory remains the parent's directory: access to an external worktree is not true session-directory scoping. Include the absolute assigned worktree path, branch, issue, owned files, non-goals, exact verification commands, and explicit commit, push, and PR deliverables in the child prompt. Require absolute paths for every read, edit, write, or apply-patch operation and an explicit Bash `workdir` or `git -C <worktree>` for every command. Relative operations, default shell CWD, LSP, VCS, snapshots, and directory-scoped events otherwise remain parent-scoped.

Before editing, testing, committing, and pushing, the child must run `pwd`, `git rev-parse --show-toplevel`, and `git status --short --branch` in the assigned worktree and verify that the resolved repository root exactly matches the assigned absolute path. Stop immediately on any mismatch; do not edit, test, commit, or push from the parent checkout.

Before launch, verify that `task`, Bash, edit/write/apply-patch, and the assigned `external_directory` are allowed. Inspect effective project policy and the session permission-rule tail because precedence is last-match-wins; a late Plan wildcard denial can override an earlier path allow. Activate Build before mutating work. Do not add an unconditional Task allow, weaken global filesystem permissions, or replace targeted worktree allowlists with `*`.

The parent must assign non-overlapping file ownership, avoid duplicating a background child's work, monitor the native child, review its PR, and clean up the worktree only after merge. Never interpret completion of a background launch part as proof that the child finished.
