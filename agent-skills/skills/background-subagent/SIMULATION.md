---
title: The flag is unset, then set
trigger: kick that off
caveat: >-
  Two runs spliced together to show both branches of the precondition check.
  In one session you get one or the other, and the result lands minutes later
  as an injected message that is not shown here.
---

# Worked example

## user

Our token refresh looks wrong somewhere in `server/auth/`. Kick that off in the
background while I finish this migration.

## tool — bash

```
$ echo "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"
unset
```

## assistant

I can't background it — `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` is unset,
and `background: true` fails without it. Two options:

- **Foreground it now.** Same audit, but it blocks this session until it
  returns, which is what you asked to avoid.
- **Restart opencode with the flag set**, then ask again. The flag is read at
  startup, so setting it in this shell will not help the running process.

I have not started the audit either way.

## note

This branch is the reason the skill exists. Silently dropping `background` and
running in the foreground is the tempting failure: it looks identical to
success until the session hangs, and the user explicitly asked not to be
blocked.

## user

restarted with the flag. kick it off

## tool — bash

```
$ echo "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"
true
$ opencode agent list
general   Multi-step work, edits, running commands
explore   Codebase search and questions about it (read-only)
diagram   Renders Mermaid to SVG or ASCII
```

## tool — task

```
task(
  description   = "Audit auth token expiry",
  subagent_type = "explore",
  background    = true,
  prompt        = "READ-ONLY. In this repo, audit how auth tokens expire and
                   refresh across server/auth/. Report: where expiry is set,
                   every place it is compared against, whether refresh and
                   access tokens use the same clock source, and any path that
                   can return a token that is already expired. Cite file:line
                   for every claim. End with UNVERIFIED: for anything you
                   inferred."
)

→ ses_abc123
  DO NOT sleep, poll for progress, ask the task for status, or duplicate this
  task's work — avoid working with the same files or topics it is using.
```

## assistant

Launched an `explore` subagent in the background to audit token expiry across
`server/auth/`. I'll report back when it lands. (`task_id: ses_abc123`)

## note

The turn ends there. Nothing follows — no "meanwhile, let me take a look at
`server/auth/session.ts`", no progress poll, no sleep. Starting the same
investigation to get a head start is the exact duplication the mechanism
exists to avoid, and the tool says so in its own return value.

The prompt is written for an agent with **zero** conversation context. It
restates the repo, the directory, the questions, the citation requirement and
the read-only constraint, because "the thing we were just discussing" means
nothing in a fresh session.

`explore` was chosen over `general` because the task is read-only. Backgrounding
a `general` that edits files is only safe when you are certain you will not
touch the same files while it runs — and here the user is mid-migration.
