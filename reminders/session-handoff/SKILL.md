---
name: session-handoff
title: Hand Off to a New Session
description: Launch one standalone session with an explicit cold-start packet, runtime settings, ownership, and stop condition.
tags: subagents, planning
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/session-handoff/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

A new session inherits nothing automatically. Create a self-contained handoff packet with the absolute repository and worktree path, branch, objective, completed progress, settled decisions and rationale, file ownership, requested agent/model, permission posture, exact verification, stop condition, and an UNVERIFIED list.

Verify the destination worktree and branch before allowing edits. Pass runtime settings explicitly; prose does not activate Plan mode or select a model. Never include secrets in prompt text or process arguments, never enable automatic permission approval unless the user requested it, and do not let parent and child edit overlapping files.

After launch, verify the requested working directory and settings, report the child session, then stop doing its assigned work.
