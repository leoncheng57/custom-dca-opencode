---
name: background-subagent
title: Delegate in the Background
description: Launch the current request as one self-contained background task, report its task ID, and do not duplicate its work.
tags: subagents
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/background-subagent/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Delegate the current request to a background subagent only when background tasks are available and the work does not require immediate back-and-forth.

Write a cold-start prompt containing the absolute working directory, objective, constraints from prior turns, whether edits are allowed, exact verification commands, and the required deliverable. Choose an installed agent type rather than guessing one.

After launch, report the task type and task ID, then stop. Do not poll, duplicate the investigation, or edit the same files while it runs. Relay the result when completion is reported. If background execution is unavailable, say so instead of silently substituting a blocking foreground task.
