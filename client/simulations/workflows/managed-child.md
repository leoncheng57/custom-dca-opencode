---
title: A read-only child reports back in its own transcript
trigger: managed-child
caveat: >-
  The child's own investigation is abbreviated. No task card appears in the
  parent and no hand-back message is injected; the human reads the result here.
---

# Worked example

## user

**Workflow — Launch a Managed Child**

Agent: explore (read-only). Model: inherited from the composer.

Assignment: audit how export errors are surfaced in the transcript and report
what a user actually sees when an export fails.

## note

Explore is read-only, so no authorization step appeared. Choosing an agent whose
access is `can-modify` resets consent and requires an explicit confirmation
before the launch button enables.

## assistant

Launched. The child has its own transcript and a policy fixed at creation time.
It is not a native task delegation: there is no task card in the parent, and no
automatic hand-back will arrive when it finishes.

## tool — bash

```
POST /api/sessions/ses_parent/managed-children
  201  { "id": "ses_child_4a1f", "origin": "managed", "agent": "explore" }
```

## note

The child's persisted title is derived from the assignment and is redacted
before truncation, so a credential-shaped token in the assignment cannot survive
into session summaries. The assignment text itself is delivered verbatim.

## assistant

The child finished in its own transcript. Because nothing hands back
automatically, I read it and am summarising here.

It found three paths that surface an export failure and one that does not: a
network abort during streaming clears the progress row without writing an error,
so the user sees the export simply vanish.

## note

The child stayed read-only throughout, so this is a report and not a fix. Acting
on it needs a separate Build session.
