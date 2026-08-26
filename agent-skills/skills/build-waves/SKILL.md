---
name: build-waves
description: Run a sustained multi-wave build in one OpenCode session, using background subagents to compress research while the parent keeps implementing until the project is verified. Covers cutting sequential waves on disjoint file and artifact boundaries, overlapping research for the next wave with parent-owned writes in the current wave, limiting concurrent tasks, planning verification up front, preserving the queue and decisions in files and todowrite across compaction or model changes, budgeting scarce parent context and cost, auditing child sessions in opencode.db, and stopping only for a real user decision, a failed verification that requires a fix wave, or completed verified work. Use when the user says "build all of it", "do not stop until it is done", "use background subagents to save time", or asks for a long-running implementation plan executed in waves. Requires OpenCode with OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true.
metadata:
  tags: "subagents, long-running, planning"
---

# Build all waves through verification

Treat a long build as one durable queue of sequential waves, not a series of
mini-projects that each wait for permission. Background children shorten the
research path; the parent remains responsible for the coherent implementation
and for reaching a verified exit.

This skill supplies the loop around delegation. Use `background-subagent` for
launch and prompt mechanics, `deep-research-subagents` for read-only fan-out,
`parallel-research-handoff` for research that precedes fresh implementation
sessions, and `manager-children` when the work belongs in multiple interactive
sessions or worktrees instead of one sustained parent.

These topologies have different continuation semantics. An in-process
background `task` can return a host-delivered result to its parent conversation.
A standalone child TUI in cmux cannot resume the parent by writing a status
file, pushing a PR, changing a badge, or running `cmux notify`. Use
`manager-children` for that topology and persist enough state for the manager's
next genuine inbound turn. Never describe a CMUX notification as an automatic
parent wake-up.

## Preflight: prove background tasks are available

Run this before promising parallel work:

```bash
test "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-}" = true
```

If it fails, do not pretend the run can use background children. Tell the user
the flag must be set before starting OpenCode, then either bail or offer a
foreground version. Do not silently turn asynchronous tasks into blocking ones.
The usual `subagent_depth` limit is one, so plan a flat fan-out; confirm the
installed roster and exact mechanics with `background-subagent`.

## Before wave 1: make the run durable

The parent context is the scarce, irreplaceable resource. Child sessions can be
restarted; a parent that loses its decisions and queue after compaction cannot.
Before launching anything:

1. Write a plan file with scope, decisions, artifact boundaries, wave order,
   ownership, dependencies, and exact verification commands.
2. Put every wave in `todowrite`, including the final verification wave. Mark
   only one implementation wave active at a time.
3. Record load-bearing findings and the next-wave brief in files. Never rely on
   "I will remember that after compaction."
4. Establish a clean baseline for the planned verification commands when
   practical, so later failures can be attributed to this run.

Keep the file plan and `todowrite` synchronized at each boundary. They are the
restart protocol if context compacts, the model changes, or the session resumes
hours later.

## Cut waves on ownership and artifacts

A wave is a set of tasks that can proceed independently because their owned
files and produced artifacts do not overlap. Cut on boundaries such as schema,
server route, client surface, migration, fixtures, or docs, not vague slices of
one feature.

For every task, write down:

- owned files or directories
- input artifacts it may read
- output artifact and acceptance check
- dependencies on prior waves
- files and shared resources it must not touch

If two tasks may edit the same file, regenerate the same lockfile, bind the same
port, or mutate the same database, they are not concurrent tasks. Sequence them
or assign the shared integration to the parent.

Cap a batch at about five concurrent tasks. More children increase duplicated
search, synthesis work, and ownership mistakes faster than they reduce elapsed
time. Fewer independent tasks are fine; do not manufacture parallelism.

## Default topology: children explore, parent writes

Make read-only research the default fan-out. Children inspect APIs, inventory
routes, find analogues, map tests, and return cited findings. The parent turns
those compressed reports into edits and retains the cross-wave design.

Pipeline the run:

1. While the parent implements wave n, launch read-only research needed for
   wave n+1.
2. Keep those prompts outside the files being edited and require concise,
   cited deliverables.
3. At the boundary, reconcile reports, update the durable plan, verify the
   completed wave's acceptance checks, and immediately begin the next wave.
4. Fan out writes only when each child's complete file set is known and
   provably disjoint from every other child and from the parent.

Do not duplicate the launch patterns from the referenced skills. Their prompt,
notification, and result-relay rules still apply here.

## Verification is the final planned wave

Create the verification wave before implementation starts. It is not cleanup
added after the last edit. Include the repository's required typecheck, tests,
build, lint, integration or end-to-end checks, plus review of the accumulated
diff against the original scope.

The exit condition is all planned verification passing, not the last feature
file being written. If verification fails, add a bounded fix wave, execute it,
and rerun the affected checks plus the final suite. Record the result in the
plan so a resumed session knows what is still unproven.

## Stopping rule

After a wave, continue to the next queued action without asking "shall I
continue?" Progress reports do not transfer control back to the user. Stop only
when one of these is true:

- A real product, scope, safety, or destructive-action decision requires the
  user. State the smallest decision and the consequences of each option.
- Verification failed and the failure must be assessed before a fix wave. Once
  assessed, create and run that wave rather than treating the failure as done.
- Every wave, including verification and any fix waves, is complete and green.

Observed model behavior is not a control mechanism. In project runs, GPT models
have appeared more likely than Opus models to continue through every wave;
Opus models have sometimes paused after one or two waves for human approval.
This is an observation, not a guarantee. The durable queue and stopping rule
must keep working when the model changes or either behavior changes.

Nor is an external process a control mechanism unless it supplies a real wake
channel. The stopping rule governs what the parent does while it has a turn; it
does not keep a completed turn scheduled. If the work uses standalone CMUX
children, the manager resumes only after a user message or a separately tested,
serialized supervisor prompt. See `manager-children` for that boundary.

> **Evidence from one observed run, not a universal law**
>
> One backend migration ran for 7.5 hours and 254 messages with 18 background
> children, one compaction, and one model change. Child batch sizes were
> 3, 5, 2, 2, 2, and 1. Sixteen children were read-only `explore`; two were
> `general`. Child cost was $60.15 versus $196.62 in the parent. The parent
> reached 90% context, compacted to 26%, changed from Opus 5 to GPT-5.6, and
> retained Waves 0-5 because the queue lived in durable state. Verification had
> not been planned and was added only after user intervention: the reason this
> skill requires it up front.

## Audit child sessions after the run

OpenCode stores child sessions in `~/.local/share/opencode/opencode.db` with the
parent session id, transcript, model, and cost. Use SQLite when a report needs
provenance or the run needs a cost and behavior audit:

```sql
SELECT datetime(time_created / 1000, 'unixepoch') AS created,
       agent,
       round(cost, 2) AS cost,
       title
FROM session
WHERE parent_id = 'ses_...'
ORDER BY time_created;
```

Use the rows to find which child produced a claim, inspect its transcript, and
compare planned ownership with actual delegation. Treat the audit as evidence
for improving the next wave plan, not as a substitute for final verification.

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
one wave boundary, with the next wave's research overlapping the current wave's
writes and the run continuing without asking permission.
