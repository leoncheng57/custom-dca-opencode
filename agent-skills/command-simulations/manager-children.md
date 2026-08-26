---
title: Dispatching workers without promising an automatic wake-up
trigger: /manager-children
caveat: >-
  Only the dispatch boundary is shown. The manager resumes on a later inbound
  turn, reviews PRs sequentially, and runs the final verification wave.
---

## user

/manager-children paginate transcripts and protect foreign-agent permissions

## assistant

I wrote a durable three-wave plan and split the work by ownership:

```text
worker A  transcript API and client paging
worker B  session permission policy and tests
manager   sequential review, merge, full verification
```

Standalone CMUX workers will continue when this turn ends. Their status files,
PRs, and notifications do not automatically resume this manager.

## tool — bash

```text
created: repo.worktrees/transcript-pagination
created: repo.worktrees/session-permission-safety
launched: Child: Transcript Scale, Child: Permission Safety
```

## assistant

Both workers are running with disjoint ownership and required heartbeats. The
next manager turn will read durable status before reviewing either branch.

## note

The command states the pause boundary instead of implying that CMUX is an
execution scheduler for the parent conversation.
