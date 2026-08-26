---
title: Two researched prompts waiting at the checkpoint
trigger: /research-handoff
caveat: >-
  The research reports and prompt bodies are abbreviated. The transcript ends
  before launch because the two human choices are mandatory gates.
---

# Worked example

## user

/research-handoff saved filters and per-project webhook secrets

## tool — task

```
2 read-only explore agents, launched concurrently
saved filters owns client/issues/ + settings persistence
webhook secrets owns server/webhooks/ + config
```

## assistant

Both reports are back. I wrote two prompts outside the worktrees:

```
.../prompts/saved-filters.md
.../prompts/webhook-secrets.md
```

Each contains `PRE-RESEARCHED - DO NOT RE-DERIVE`, settled scope with rationale,
`GOTCHA:` lines, numbered files, reasoned exclusions, exact verification, and the
same `SHARED-RESOURCE RULE` for ports 8010 and 3210.

Read them before I fire anything. Two decisions:

1. Should the receiving sessions present plans first, or edit immediately?
2. Should they open PRs, or stop at local commits?

## note

The command stops here deliberately. Launching before those answers would turn
a review checkpoint into a notification and advertise autonomy the workflow
explicitly withholds.

The prompt files are outside both worktrees, so neither implementation branch
starts dirty.
