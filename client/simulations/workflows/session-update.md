---
title: An update arrives in a session that had moved on
trigger: session-update
caveat: >-
  The target search is abbreviated to one match. Delivery is asynchronous, so a
  204 means accepted, never completed.
---

# Worked example

## user

**Workflow — Send an update to another session**

Target: "Notification centre grouping" (ses_9d4b).

Message: the badge count must exclude suppressed records — auto-permissions and
subagent both. Confirmed against `activeCount()`.

## assistant

Preview shows the exact target and the exact prompt before anything is sent.
Nothing has been delivered yet.

## note

The update sends in the TARGET session's current mode, not this one's. A
hardcoded Build would restore write access to a session someone deliberately
left in Plan.

## tool — bash

```
POST /api/sessions/ses_9d4b/prompt?directory=...
  204 accepted
```

## assistant

Accepted, not completed. 204 means the target session received the prompt; it
does not mean the work is done or that anyone is watching that transcript.

## note

The following turn is what the RECEIVING session sees.

## user

the badge count must exclude suppressed records — auto-permissions and subagent
both. Confirmed against `activeCount()`.

## assistant

This arrived from another session in the same project, delivered after an
explicit preview there.

Reconciling it with what I am doing: I had already filtered the list but not the
count, which is exactly the mismatch this warns about — a badge counting rows the
user asked not to see. I am applying the same filter to `activeCount()` before
continuing.
