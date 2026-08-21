---
name: build-waves
title: Build in Verified Waves
description: Execute a large build as durable sequential waves, overlap only disjoint research, and stop after final verification.
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/build-waves/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Turn the work into a durable queue of sequential waves with explicit ownership, dependencies, outputs, and acceptance checks. Record the plan and decisions in files or the task list so compaction or a resumed session does not lose them.

Use background agents primarily for read-only research on the next wave while the parent implements the current wave. Never run tasks concurrently when they may edit the same file, regenerate the same artifact, bind the same port, or mutate shared state.

Plan verification as the final wave before implementation starts. Continue through queued waves without asking for routine approval. Stop only for a real user decision, a failure that requires a bounded fix wave, or completion of all required verification. Leave merge and push actions to explicit user requests.
