---
title: A Plan session launched with explicit settings
trigger: /session-handoff
caveat: >-
  The process check proves requested flags, not provider acceptance. A real
  handoff also waits for the child to restate its packet before declaring success.
---

# Worked example

## user

/session-handoff inspect the playback timer in Plan mode with GPT Sol high effort

## assistant

This is a fresh interactive session, not a fork and not a subagent. I wrote a
packet outside the worktree with the absolute path, branch, read-only objective,
owned files, forbidden edits, verification expectations, and stop condition.

Exact launch:

```
opencode /Users/you/src/app \
  --agent plan \
  --model openai/gpt-5.6-sol \
  --prompt "$(cat /Users/you/src/app.worktrees/prompts/playback-review.md)"
```

The interactive TUI has no `--variant` flag, so "high effort" is marked
UNVERIFIED rather than smuggled in as prompt prose. If provider-specific effort
is required, use `opencode run --variant high` instead.

## tool — process check

```
requested: --agent plan --model openai/gpt-5.6-sol
working directory: /Users/you/src/app
```

## assistant

The child is running with the requested agent, model, and directory. I am not
reviewing those files in this parent session. I will wait for its report.

## note

Nothing was inherited. Plan mode and model came from CLI flags; context came
from the packet. The missing effort flag remains visible instead of being
claimed.

The parent stops rather than duplicating the child's review.
