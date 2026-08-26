---
name: background-subagent
description: Hand the request the user just made to a background subagent with the task tool and return immediately instead of doing the work inline. Covers restating the request as a self-contained prompt for an agent with zero conversation context, the OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS precondition for background:true, choosing the subagent_type, resuming or adding context to a running task with task_id, reporting what was launched and then stopping rather than duplicating the work, and when backgrounding is the wrong call. Use when the user says "do this in the background", "kick that off", "hand it to a subagent", "run that async", "don't block on it", or "fire and forget".
metadata:
  tags: "subagents"
---

# Fire the current prompt at a background subagent

Take what the user just asked for, restate it so a context-free agent can act
on it, launch it with `background: true`, tell the user what went out, and
**stop**. The value of this is entirely in not doing the work twice.

---

## Preconditions — check before promising anything

`background: true` requires an environment flag. Without it the task tool
fails with:

> Background subagents require `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`

```bash
echo "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"
```

If it is unset, say so and offer the alternatives: run it in the foreground
(you will block until it returns), or the user restarts opencode with the flag
set. Do not silently drop `background` and run in the foreground — the user
asked not to be blocked, and a foreground task looks identical until it hangs.

Also true here, verified against `opencode 1.18.19`:

- **`subagent_depth` defaults to `1`.** If you are yourself a subagent you
  cannot launch one. The failure is `Subagent depth limit reached`.
- The result of a subagent **is not shown to the user**. Whatever it returns,
  you have to relay.

## Step 1 — restate the request self-contained

This is the failure mode. A fresh subagent sees **only your `prompt` string**.
Not the conversation, not the file you were both just looking at, not the
directory you are standing in, not the constraint the user gave three turns
ago. "Do what the user asked" produces a confused agent and a wasted run.

Rewrite the request until it survives being read cold:

- **Absolute paths.** `/Users/x/proj/server/auth.ts`, never `that file` or
  `./auth.ts`.
- **The working directory**, stated explicitly.
- **Constraints from earlier turns**, restated. Branch names, "don't touch
  README", the library the user vetoed, the version pin.
- **Verification.** The exact command that proves the work is done
  (`npm test`, `npm run typecheck`) — the subagent cannot ask you.
- **Write or research?** Say which. The tool description is explicit that the
  agent "is not aware of the user's intent" on this point.
- **The deliverable**, since it returns exactly one message to you.

A useful check: could a colleague who just walked in execute this prompt? If
not, it is not ready.

## Step 2 — pick the `subagent_type`

Check what exists on this machine before choosing — the roster is
configurable and differs per install:

```bash
opencode agent list
```

At time of writing, here:

| Type | For | Constraint |
|---|---|---|
| `general` | Multi-step work, edits, running commands | Full permissions; `todowrite` denied |
| `explore` | Codebase search and questions about it | **Enforced read-only** (grep/glob/read/webfetch/websearch only) |
| `diagram` | Rendering Mermaid to SVG or ASCII | `edit` and `bash` denied |

Backgrounding a read-only `explore` is nearly always safe. Backgrounding a
`general` that edits files is only safe if you are certain you will not touch
the same files while it runs.

## Step 3 — launch

```
task(
  description  = "Audit auth token expiry",        // 3-5 words
  subagent_type= "explore",
  background   = true,
  prompt       = "<the self-contained restatement>"
)
```

`command` is an optional field for recording what triggered the task; skip it
unless a slash command did.

## Step 4 — report, then stop

The tool returns immediately with a `task_id` and tells you, verbatim:

> DO NOT sleep, poll for progress, ask the task for status, or duplicate this
> task's work — avoid working with the same files or topics it is using.

Obey that. You are **notified automatically** when it finishes; the result is
injected into this session as a message.

Say something short and end the turn:

> Launched an `explore` subagent in the background to audit token expiry across
> `server/auth/`. I'll report back when it lands. (`task_id: ses_abc123`)

Then genuinely stop. Do not start the same investigation "just to have a head
start" — that is the exact duplication this mechanism exists to avoid. If
there is genuinely non-overlapping work in front of you, do that instead;
otherwise end the response.

Never claim the work is done. It is running.

## Adding context to a running task

Passing `task_id` for a task that is **still running** does not start a new
one — it sends your prompt to the live task as additional context. Useful when
the user follows up with a correction:

```
task(description="Audit auth token expiry", subagent_type="explore",
     task_id="ses_abc123", prompt="Also cover refresh tokens in server/session/.")
```

Passing `task_id` for a **finished** task resumes that subagent's session with
its previous messages and tool outputs intact — cheaper and better-informed
than a fresh agent for a follow-up on the same material.

## When not to background this

- **You need the result to continue this turn.** Foreground it. Backgrounding
  something you are about to wait for is strictly worse — same latency, plus
  you lose the ability to react as it goes.
- **The task needs back-and-forth.** A subagent cannot ask a question. Anything
  ambiguous, anything where you would expect a "did you mean X?", stays inline.
- **It is small.** Under a handful of tool calls, the round trip costs more
  than the work.
- **It will edit files you are about to edit.** Concurrent writes to the same
  file, or two agents racing on a port or a lockfile.
- **The user wants to watch.** Background output arrives as one message at the
  end; there is no visible progress. If they want to steer, keep it inline or
  launch a separate interactive session instead.
- **You are already a subagent.** Depth limit is 1.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` | Flag not set | Report it; offer foreground or a restart with the flag |
| `Subagent depth limit reached` | You are a subagent | Cannot nest; do it inline |
| `Unknown agent type: X is not a valid agent type` | Guessed the roster | `opencode agent list` first |
| Subagent asks a clarifying question and dies | Ambiguous prompt | Close every decision in the prompt before launching |
| Subagent worked on the wrong file | Relative path or "that file" | Absolute paths only |
| Duplicated work, conflicting edits | Kept working after launching | Report and stop, or pick non-overlapping work |
| User never sees the result | Result is invisible to the user by design | Relay a summary when the notification arrives |

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing,
showing both branches of the precondition check — the flag unset and refused,
then set and launched, with the turn ending at the report.
