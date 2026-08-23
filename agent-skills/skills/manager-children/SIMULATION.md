---
title: Two workers continue while the manager pauses
trigger: make this session a manager
caveat: >-
  The transcript shows one dispatch and resume boundary. A real wave includes
  implementation, PR review, sequential integration, and final verification.
---

## user

Make this session a manager and spin up separate workers for API pagination and
permission safety.

## assistant

I will use isolated sibling worktrees and unfocused CMUX workspaces. The workers
can continue after this turn ends, but their notifications cannot resume me. I
will persist the queue so the next real inbound turn can continue deterministically.

```text
wave 0  pagination          worker A
        permission safety  worker B
wave 1  integration        manager
wave 2  verification       manager
```

## tool — bash

```text
workspace:40  Child: Transcript Scale
workspace:41  Child: Permission Safety
```

## assistant

Both assignments require `.agent-status.json`, ten-minute heartbeats, verified
commits, pushed branches, and PRs. They own disjoint artifacts. I am ending this
turn rather than polling; the children remain active.

## note

This is the important pause. `cmux notify` may alert the human, but it does not
create a new manager turn.

## user

Continue the wave.

## tool — read

```text
pagination:         phase=pr-open  PR #42  checks=green
permission-safety: phase=working  heartbeat=3m
```

## assistant

I resumed from durable state rather than memory. I will review PR #42 now and
leave the second worker running; integration remains sequential.

## note

The genuine user message is the wake channel. The status files tell the resumed
manager exactly what action is safe next.
