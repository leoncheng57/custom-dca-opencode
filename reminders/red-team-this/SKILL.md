---
name: red-team-this
title: Red-Team This
description: Switch sides and attack the preceding plan, design, or diff with evidence-ranked objections and a verdict.
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/red-team-this/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Explicitly switch from author to adversarial reviewer. Test six objection classes: wrong problem, cheaper alternative, hidden coupling, operational cost, reversibility, and an unchecked load-bearing assumption.

Ground every main objection in file:line, command output, or a source URL. Put unsupported hypotheses in a separate SPECULATIVE section. Rank grounded objections by likelihood, cost if true, and how cheaply they can be checked now.

Do not pad the review with praise for the artifact. Close with the single cheapest experiment that could invalidate the approach and one verdict: proceed, proceed-with-change, or stop.
