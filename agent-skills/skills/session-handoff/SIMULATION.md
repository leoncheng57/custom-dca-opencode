---
title: Plan mode must be a flag
trigger: launch a session in plan mode
caveat: >-
  The transcript compresses packet authoring and child startup. It shows one
  deliberately incorrect launch followed by a corrected launch; a real parent
  should catch the missing flag before starting the first child.
---

# Worked example

## user

Please launch a session in plan mode for the auth refresh work. It should inspect
the existing branch and return an implementation plan, but not edit anything.

## assistant

I will inspect the installed roster and existing sessions, write a cold-start
packet outside the worktree, and launch a separate TUI. The requested mode,
model, directory, permissions, and stop condition must all be explicit because
the child inherits none of them from this conversation.

## tool — bash

```bash
$ opencode agent list
build (primary)
...
plan (primary)
...
general (subagent)
...
explore (subagent)
...
scout (subagent)
$ # Unrelated permission details and agents are elided.
$ opencode models
...
openai/gpt-5.6-sol
$ # Other installed models are elided.
$ opencode session list
```

## assistant

The packet at `/Users/alex/.local/state/opencode-handoffs/auth-plan.md` names
`/Users/alex/Projects/acme.worktrees/auth-refresh`, branch
`feat/auth-refresh`, the planning objective, settled decisions with rationale,
owned and forbidden files, `agent: plan`, `model: openai/gpt-5.6-sol`,
`variant: UNVERIFIED - TUI has no --variant flag`, ask-before-tools permission
posture, verification commands, and this stop condition: return the plan and do
not edit, commit, push, or open a PR.

It also requires the child's first reply to restate those fields.

## tool — bash

```bash
$ git -C /Users/alex/Projects/acme.worktrees/auth-refresh branch --show-current
feat/auth-refresh
$ opencode /Users/alex/Projects/acme.worktrees/auth-refresh \
    --model openai/gpt-5.6-sol \
    --prompt "$(cat /Users/alex/.local/state/opencode-handoffs/auth-plan.md)"
```

## note — guard fires

The launch omitted `--agent plan`. The packet's prose requested planning, but
the new TUI selected its default primary agent and began editing. The parent
stops that child rather than trusting the prose or letting it continue. This is
the failure the skill exists to prevent: nothing about the parent's mode was
inherited.

## assistant

That launch was invalid: I carried the requested mode only in prose. I stopped
it. I will relaunch from the same verified worktree with `--agent plan`; I will
not add `--auto`, because you did not request automatic approval.

## tool — bash

```bash
$ opencode /Users/alex/Projects/acme.worktrees/auth-refresh \
    --agent plan \
    --model openai/gpt-5.6-sol \
    --prompt "$(cat /Users/alex/.local/state/opencode-handoffs/auth-plan.md)"
```

## note — launch verification

The corrected child's first reply restates the absolute worktree, branch,
`plan` agent, model, unverified TUI variant, ask-before-tools posture, read-only
ownership boundary, objective, and stop condition. The child also confirms its
working directory and branch before inspecting files. Process arguments prove
what the parent requested, not whether the provider accepted an unsupported
setting.

## assistant

Launched a standalone TUI in
`/Users/alex/Projects/acme.worktrees/auth-refresh` on `feat/auth-refresh` with
`--agent plan` and `--model openai/gpt-5.6-sol`. No `--auto` was used. The child
restated the packet and will stop after returning an implementation plan; I am
not doing the auth work in this session.
