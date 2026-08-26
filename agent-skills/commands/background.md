---
description: Launch one self-contained task in the background and stop
agent: build
---

Background this task: `$ARGUMENTS`

Current flag value:

!`printf '%s' "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"`

1. If the value above is not `true`, do not launch. Explain that OpenCode must
   be restarted with `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`, and
   offer foreground execution as the blocking alternative.
2. If `$ARGUMENTS` is empty or ambiguous, ask one clarifying question instead
   of dispatching a task that cannot recover.
3. Restate the task for an agent with zero conversation context: absolute
   working directory and file paths, earlier constraints, whether it may edit,
   exact verification commands, and the final deliverable.
4. Check the installed agent roster before choosing a type. Prefer `explore`
   for read-only research; use `general` for writes only when its file ownership
   cannot overlap this session.
5. Launch exactly one task with `background: true`.
6. Report the type, scope, and returned `task_id`, then end the turn. Do not
   poll, sleep, or begin the same work "while it runs".

Never claim the task is complete when it has only been launched.

For preconditions, context-restatement rules, resuming via `task_id`, and the
full failure-mode table, load the `background-subagent` skill.
