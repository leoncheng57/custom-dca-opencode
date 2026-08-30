---
title: An isolated Plan root that has no link to its launcher
trigger: start-dca-session
caveat: >-
  Worktree creation and the new session's own work are abbreviated. Build in an
  existing directory requires an explicit authorization step not shown here.
---

# Worked example

## user

**Workflow — Start a DCA session**

Isolated worktree: yes. Mode: Plan. Model: from the composer.

Assignment: work out whether session status can be joined into the notification
centre without a second fan-out.

## assistant

Isolated and Plan are the defaults, so no authorization step is required. Build
in an existing directory would have demanded one, because that grants write
access to a checkout someone may be using.

## tool — bash

```
POST /api/sessions/root
  201  { "id": "ses_root_7c2e",
         "directory": "/Users/you/Projects/app.worktrees/status-join",
         "mode": "plan" }
```

## assistant

Created. This is a root session: it has no parent, no task card, no Managed
Child relationship, no automatic hand-back, and no provenance link back to this
session. Nothing about this conversation travels with it.

That is why the assignment has to stand alone. "Continue what we discussed"
would arrive meaningless.

## note

If the create had succeeded but the first prompt had failed, the response would
name the session that still exists and disable retry — so a half-made session is
reported rather than silently duplicated.

## assistant

Open the new session to follow it. It will not report back here.
