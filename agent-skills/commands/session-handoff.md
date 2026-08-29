---
description: Carry the current task into one explicitly configured OpenCode session
agent: build
---

Prepare one standalone OpenCode session for: `$ARGUMENTS`

Nothing is inherited automatically. Carry settings through explicit CLI flags
and a self-contained handoff packet.

1. Choose the mechanism: fresh interactive TUI for steerable work,
   `opencode run` for scripted work, `--session <id> --fork` only when history
   must be copied, or the task tool when this is actually a subagent job.
2. Inspect `opencode agent list`, `opencode models`, the repository root, branch,
   worktree state, and baseline. Mark anything you cannot verify as UNVERIFIED.
3. Write a prompt file outside the worktree containing the absolute path,
   branch, objective, progress, settled decisions with rationale, owned and
   forbidden files, requested agent/model/variant, permission posture,
   verification commands, stop condition, and unverified assumptions.
4. Show the packet and exact launch command before executing it. Use
   `--agent plan` or `--agent build`; do not express mode as prompt prose.
   Use `--variant` for provider-specific reasoning effort. `--thinking` controls
   display only. Never add `--auto` unless the user explicitly requested it.
5. Keep secrets out of the packet and process arguments. Verify the target
   branch before allowing edits.
6. After launch, verify the working directory, branch, selected agent and model,
   and that the first reply understood the packet. A successful process start
   proves what was requested, not what the provider accepted.

Use cmux only as an optional presentation wrapper and never steal focus. Store
the packet outside every worktree and keep secrets out of it: prompt text can
surface in shell history or process arguments. Require the child's first reply
to restate its path, branch, objective, ownership, agent, model, variant,
permission posture, and stop condition before work begins.

| Failure | Response |
|---|---|
| Child edits instead of planning | Relaunch with `--agent plan`; prose is not mode control |
| History was copied unexpectedly | Use a fresh TUI or run without continuation/fork flags |
| Child opens the wrong repository | Pass an absolute project path or `--dir` |
| Parent and child overwrite one another | Assign disjoint ownership and stop one writer |
| Secret appears in process arguments | Stop, remove it, and rotate the exposed credential |
| Provider ignores the reasoning variant | Mark acceptance UNVERIFIED until reported |

After launch, report what started and end the parent turn. Do not begin the
child's assigned work.
