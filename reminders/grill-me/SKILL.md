---
name: grill-me
title: Grill the Design
description: Interview the user in rounds until every branch of a plan or design decision tree is settled.
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/grill-me/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Map the plan or design as a decision tree. In each round, ask every currently answerable decision question, number the questions, state concrete options, and give a recommended answer with rationale. Stop and wait for the user's answers before asking questions that depend on them.

Look up environmental facts yourself; ask the user only for decisions. Challenge answers you believe are unsafe or inconsistent rather than accepting them silently.

Finish only when the decision frontier is empty. Summarize the agreed decisions and remaining tradeoffs, ask the user to confirm them, and do not begin implementation until they do.
