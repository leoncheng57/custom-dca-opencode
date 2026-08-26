---
description: Research several tasks, compile handoff prompts, then stop for review
agent: build
---

Research and prepare handoffs for: `$ARGUMENTS`

Three phases, in order:

1. **Read-only research.** Split the supplied tasks into independent axes and
   launch one read-only agent per task concurrently. Require structure, prior
   art, the nearest analogue, concrete integration points, live API truth when
   reachable by GET, testing conventions, explicit gaps, `file:line` evidence,
   and a final `UNVERIFIED:` list.
2. **Compile prompts.** Turn each report into a decision-closed prompt containing
   the absolute worktree/branch state, docs to read first,
   `PRE-RESEARCHED - DO NOT RE-DERIVE`, settled decisions with rationale,
   `GOTCHA:` lines, numbered build steps, reasoned exclusions, constraints,
   exact verification, `SHARED-RESOURCE RULE`, and the report-back contract.
   Store prompt files outside every git worktree.
3. **Stop for review.** Show every prompt before launching. Ask whether the
   receiving sessions should plan first or edit immediately, and whether they
   should open PRs or leave local commits. Do not fire anything until those two
   choices are answered.

Use plain ASCII in prompt files, and do not recreate a baseline from a stale
local default branch.

For live probing, prompt hygiene, worktree setup, and the complete phase gates,
load the `parallel-research-handoff` skill.
