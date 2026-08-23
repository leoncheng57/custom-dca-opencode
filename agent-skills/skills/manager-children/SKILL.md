---
name: manager-children
description: Coordinate implementation waves through separate OpenCode TUI workers in isolated git worktrees and cmux workspaces. Covers ownership boundaries, cold-start assignment packets, status files and heartbeats, PR-based delivery, monitoring, sequential merge gates, and the critical fact that standalone children do not automatically resume the manager. Use when the user says "make this session a manager", "spin up workers", "parallel children", "separate cmux workspaces", "fire and forget", or asks one parent to manage several implementation agents.
metadata:
  tags: "subagents, worktrees, planning"
---

# Manage standalone OpenCode workers honestly

Use this skill when implementation belongs in several persistent OpenCode TUIs,
branches, and worktrees. The current session is the manager: it defines waves,
assigns disjoint ownership, reviews results, and controls integration. Children
implement one bounded assignment each.

Use `build-waves` instead when one parent should retain all coherent writes and
background `task` children only compress research. Use `session-handoff` for one
standalone child and `worktree-up` for the full worktree safety procedure.

## Continuation contract

Do not confuse child persistence with manager persistence.

```text
child TUI --writes--> .agent-status.json
          --pushes--> branch / PR
          --alerts--> cmux notification

manager --when a turn starts--> reads durable state, reviews, merges, dispatches
```

A standalone child in another cmux workspace cannot resume or call the manager
merely by writing a file, pushing a branch, changing a cmux badge, or running
`cmux notify`. The notification alerts the human; it is not an OpenCode prompt.
The live tracker is also display-only.

"Fire and forget" therefore means the child keeps working after the manager's
turn ends. It does not mean the manager keeps executing unattended.

The manager gets another turn only through a real inbound wake channel:

- the user sends or resumes a message;
- the host delivers an in-process background `task` result to the parent; or
- an external supervisor explicitly prompts the manager session.

This skill does not implement the third mechanism. Never claim full unattended
wave progression unless a tested supervisor exists. Such a supervisor must know
the exact parent session, prove it is idle, deduplicate completion events, and
serialize prompts. Posting blindly can race a running turn or lose work.

## Optional wake strategies

Use the default attended workflow unless the user explicitly accepts wake-up
risk. There are four practical levels:

1. **Human wake, recommended.** Children run `cmux notify`; the user sends
   "continue" when ready. This is simple and honest. The durable plan makes the
   resumed turn deterministic.
2. **Exact-surface CMUX injection, best effort.** Capture the manager surface
   UUID at dispatch and let one designated child type a unique resume message
   into that surface after delivery. This is easy, but CMUX cannot prove the
   OpenCode turn is idle. Input can race a running turn, remain in the composer,
   target a closed surface, or be submitted twice.
3. **Same-server supervisor, robust but not simple.** A separate process watches
   status files, deduplicates terminal phases, confirms the manager session is
   idle on the same OpenCode server, and sends one serialized prompt through the
   session API. Cross-process status is not authoritative, so every participant
   must use that same server.
4. **One-shot background timer chain, useful for recurring checks.** Launch one
   read-only background `task` child that waits five minutes, inspects one
   worker, and returns. Its host-delivered result is a real parent wake channel.
   If work is still active, the resumed manager captures a fresh baseline and
   launches exactly one replacement five-minute timer. Repeat until the worker
   is delivered or blocked.

Do not fan out 5-, 10-, and 15-minute timers in advance. Overlapping timers cost
more, wake the manager with obsolete baselines, and continue reporting after an
earlier timer already triggered integration. The chain keeps only one pending
timer and refreshes its evidence on every manager turn.

Timer prompts must carry a freshness baseline. Before launch, record:

```text
dispatched_at: 2026-08-21T23:40:00Z
baseline_status_updated_at: 2026-08-21T23:30:02Z
baseline_pr_head: 177421a
```

After the delay, a timer may report `READY FOR MANAGER REVIEW` only when all of
these are true:

- `.agent-status.json.updated_at` is later than `dispatched_at`;
- the worker reached the expected terminal phase after dispatch;
- the local branch and remote PR head agree; and
- current CI results validate that exact PR head.

An old `done` record and green checks on the baseline SHA are stale evidence,
not readiness. The timer must report `STALE: no post-dispatch transition` and
include both timestamps and SHAs. On a non-terminal result, the manager launches
one new five-minute timer with the just-observed timestamp and SHA as its
baseline. If the PR is already merged, report `SUPERSEDED: already merged` with
the merge commit. A deleted remote feature branch is expected cleanup after
merge and must not be misreported as `NOT READY`.

For an explicitly accepted best-effort wake, capture the UUID rather than a
renumberable `surface:N` reference:

```bash
cmux --json --id-format both identify
```

Give the UUID only to one designated waker. After its branch is pushed and PR
state is recorded, it may run once:

```bash
cmux send --surface "$MANAGER_SURFACE_UUID" -- \
  "Worker task-slug reached pr-open. Resume from durable manager status."
cmux send-key --surface "$MANAGER_SURFACE_UUID" enter
```

Record a wake token before sending so retries do not duplicate the message. If
the command fails or idle state is uncertain, fall back to `cmux notify` and
human wake. Never give every parallel child permission to submit independently;
simultaneous completion would create competing manager turns.

## 1. Make the manager durable

Before launching workers:

1. Write a plan file with wave order, decisions, ownership, dependencies,
   verification commands, and the next resume action.
2. Mirror the plan in `todowrite`, including review, integration, and final
   verification. Keep exactly one manager action active.
3. Record child workspace, worktree, branch, task slug, and expected artifact.
4. State which events require a user decision and which the manager may resolve.

The plan file and task list are the resume protocol after a pause, compaction,
model change, or application restart. Chat memory is not durable orchestration.

## 2. Cut waves on ownership

Each child must own a complete, bounded artifact and a known file set. Parallel
children may read shared files but must not edit the same file, lockfile,
migration, generated output, fixed port, or database.

If two tasks may touch one integration seam, sequence them or assign that seam
to the manager. Cap a wave at about five children; do not manufacture
parallelism from tightly coupled work.

## 3. Create isolated worktrees

Fetch first and branch from the current remote default branch, never a stale
local checkout. Worktrees are siblings of the repository.

```bash
git -C /absolute/repo fetch origin
git -C /absolute/repo worktree add \
  /absolute/repo.worktrees/task-slug \
  -b feat/task-slug origin/main
```

Use the repository's actual default branch. Verify the path, branch, and clean
status before allowing edits. Follow `worktree-up` for ignored environment files,
dependency installation, fixed ports, and cleanup.

## 4. Launch persistent children without stealing focus

Ask for the model if the user did not specify one. Use `--auto` only when the
user explicitly authorized automatic permission approval.

```bash
cmux workspace create \
  --name "Child: Task Name" \
  --cwd "/absolute/repo.worktrees/task-slug" \
  --command "opencode --auto -m openai/gpt-5.6-sol" \
  --group workspace_group:2 \
  --group-placement end \
  --focus false
```

Resolve the new workspace and terminal surface by title. Re-resolve them after
a cmux restart; short numeric references are not stable.

## 5. Send one cold-start assignment

Every assignment must contain:

1. Exact repository, worktree, and branch.
2. Objective, owned files, forbidden files, and concurrent workers.
3. Settled contracts and explicit non-goals.
4. Permission posture and exact model.
5. Required tests and the definition of done.
6. Commit, push, and PR rules. Children never push the default branch.
7. The reporting protocol below.

Require `.agent-status.json` at the worktree root and ensure it is gitignored:

```json
{
  "task": "task-slug",
  "phase": "assigned",
  "branch": "feat/task-slug",
  "pr_url": null,
  "summary": "Assignment received",
  "blockers": [],
  "updated_at": "2026-08-21T12:00:00Z"
}
```

Allowed phases are `assigned`, `working`, `verifying`, `pushed`, `pr-open`,
`blocked`, and `done`. The child must obtain `updated_at` by running
`date -u +%Y-%m-%dT%H:%M:%SZ`, update at every phase change, and heartbeat at
least every ten minutes. It should mirror the phase with `cmux set-status` and
notify on `done` or `blocked`.

The assignment ends with: print a concise summary and stay available for
follow-up. A successful launch command is not proof that the prompt arrived;
confirm the workspace metadata or first status record.

## 6. Monitor durable signals

Use this order:

1. `.agent-status.json` phase, heartbeat age, and blockers.
2. Git branch status, pushed commits, PR state, and CI.
3. Child screen only when status is stale or contradictory.

Do not continuously scrape TUI screens. A status file unchanged for more than
15 minutes is suspicious; inspect the worktree and screen, then nudge or resume
the child. A `done` badge without a pushed branch or PR is not delivered work.

An optional dashboard may watch the status files, but it does not wake the
manager. Leave user-owned monitor surfaces open until the user closes them.

## 7. Resume the manager deterministically

At the beginning of every resumed turn:

1. Read the plan file and `todowrite` before relying on conversation memory.
2. Read every active `.agent-status.json`.
3. Fetch remote branches and inspect PR checks.
4. Reconcile completed artifacts against ownership and shared contracts.
5. Continue the next queued manager action without asking for permission unless
   a real product, safety, or destructive decision is unresolved.

If no child is ready, report that workers continue independently and end the
turn. Do not busy-wait or pretend the manager remains scheduled.

## 8. Integrate one branch at a time

Review each diff before integration. Merge or squash one PR, run the repository's
full verification suite, then proceed to the next. Resolve conflicts
semantically and search for conflict markers. Never let a child bypass failed
checks, branch protection, or the manager's review gate.

After the wave is green, update the durable plan and immediately dispatch the
next wave when the current turn is active. Clean worktrees and branches only
after merge and only when no follow-up session needs them.

## Failure modes

| Symptom | Cause | Correct response |
|---|---|---|
| Manager stops after dispatch | Standalone children cannot wake it | Wait for a real inbound turn; resume from durable state |
| Notification appears but no manager action follows | `cmux notify` targets the human, not OpenCode | Do not advertise it as an automation callback |
| Two children edit one seam | Wave was cut by feature labels, not ownership | Stop one writer and sequence integration |
| Tracker says done but no PR exists | Status is self-reported, not delivery proof | Inspect git and require push/PR evidence |
| Child silently works in the wrong checkout | Launch used an implicit directory | Relaunch with absolute worktree and branch |
| External wake starts duplicate turns | Supervisor did not check idle/deduplicate | Disable it until serialization is proven |
| Timer says ready while worker is still fixing | It trusted a pre-dispatch `done` record or baseline CI | Require post-dispatch timestamp and exact-head checks |
| Several timers wake for one worker | The manager pre-scheduled 5/10/15-minute checks | Keep exactly one five-minute timer; replace it only after its result |
| Later timer says merged work is not ready | It requires a feature branch that was deleted after merge | Report `SUPERSEDED` from PR state and merge commit |
| Manager loses the next action after compaction | Queue existed only in chat | Restore the plan file and synchronized task list |

## Worked example

`SIMULATION.md` shows two CMUX workers continuing after the manager pauses, then
the manager resuming from status files after a genuine user turn.
