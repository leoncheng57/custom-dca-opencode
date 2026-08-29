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

Never claim the task is complete when it has only been launched. A background
result is not shown directly to the user; relay it when it returns.

Do not background work when you need its result this turn, the task needs
back-and-forth, it takes only a handful of tool calls, it overlaps files or a
shared resource you will touch, or this session is already a subagent. The
usual `subagent_depth` limit is one.

If the user corrects a running task, pass its `task_id` with the added context;
that continues the same task. Reusing a finished `task_id` resumes its session.

| Failure | Response |
|---|---|
| Background flag is unavailable | Offer foreground execution or an OpenCode restart; never silently block |
| Depth limit or unknown agent type | Stop; do not bypass the limit, and inspect the roster |
| Prompt is ambiguous | Ask before launch; a child cannot recover through dialogue |
| Files or shared state overlap | Keep the work inline or assign disjoint ownership |
| Result arrives | Verify and relay it; do not assume the launch response was completion |
