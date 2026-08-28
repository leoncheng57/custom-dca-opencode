---
name: native-worktree-subagents
description: Run mutating OpenCode Task children in isolated sibling Git worktrees while preserving native parent-child lineage and hand-back. Covers Plan deny inheritance, worktree containment, absolute-path prompts, preflight guards, disjoint ownership, and reviewing child results before merge. Use when delegating implementation to OpenCode Task subagents that must edit a separate branch safely.
metadata:
  tags: worktrees, subagents
---

# Run native worktree subagents

Use native OpenCode Task children when delegated work must retain `parentID`,
sidebar visibility, foreground/background behavior, and result hand-back. Give
every mutating child a sibling Git worktree and branch created from fresh
`origin/main`.

## Prove the parent can delegate safely

Before launch, confirm the parent is a fresh Build-only session. A parent that
previously activated Plan can carry historical deny rules into new children even
after Build restores the parent's own tools. If the child cannot run the
preflight below, stop instead of substituting an independent root session.

## Give the child an unambiguous boundary

The child session still belongs to the parent's OpenCode directory. Granting an
external directory permission permits file access; it does not change relative
path resolution, default shell CWD, LSP/VCS/snapshot scope, or event directory.
Every child prompt must therefore state:

- the exact absolute worktree path and branch
- that edits are allowed only inside that path
- that every Bash call sets `workdir` to that path or uses `git -C <absolute-path>`
- that every read, edit, and patch uses an absolute path inside the worktree
- explicit file ownership, non-goals, verification commands, commit/push
  instructions, and the required final report

Require this guard before edits, tests, commit, and push:

```bash
pwd
git rev-parse --show-toplevel
git status --short --branch
```

The child must stop without mutation unless both `pwd` and the Git top-level
equal the assigned worktree. It must never fall back to the parent checkout,
weaken filesystem permissions, force-push, or push the default branch.

## Parallelism requires disjoint ownership

Launch native Task children in parallel only when their file ownership and
shared resources do not overlap. A shared lockfile, migration, port, generated
artifact, or integration file makes work concurrent in appearance but serialized
in reality. Give the shared boundary to one child or the parent.

After launch, do not duplicate a child's work. Review every child diff and
verification result before presenting or merging its PR.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Child edits the parent checkout | Relative paths resolved in the parent directory | Require the absolute worktree path and run the guard before mutation |
| Child cannot run a tool after switching to Build | A historical Plan deny was inherited | Stop and create a fresh Build-only parent rather than weakening rules |
| Two children conflict despite separate branches | Ownership or a shared resource overlapped | Sequence the work or assign the shared boundary to one owner |
| Child finishes but its result is unclear | Prompt omitted deliverable or verification requirements | State the final report, owned files, and exact commands before launch |
| Parent repeats child work | Background launch was treated as completion | Wait for the native hand-back and review the child output |

## Worked example

For a child that updates only a component, assign one absolute worktree, name
the component and tests it owns, prohibit lockfile changes, require its guard
output before edits, and require the focused test command plus a concise diff
summary at hand-back.
