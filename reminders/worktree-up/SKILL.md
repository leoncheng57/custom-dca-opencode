---
name: worktree-up
title: Create a Safe Worktree
description: Create a sibling git worktree from the current remote default branch, install dependencies, and check shared resources.
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/worktree-up/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Before writing code on a shared branch, fetch the remote and create a sibling worktree at `<repo>.worktrees/<topic>` on a dedicated `<type>/<topic>` branch cut from `origin/<default>`, never a stale local default branch. If the branch is already checked out elsewhere, use that worktree instead of bypassing Git's refusal.

Install dependencies and copy only required gitignored local configuration, reviewing relative paths. Run the repository's baseline checks before editing. Before starting servers or stacks, inspect fixed ports and shared state and verify which process owns an occupied port; only one worktree may use a conflicting resource.

Report the absolute worktree path, branch, source commit, dependency state, baseline result, and resource constraints. Never push the default branch or force-push.
