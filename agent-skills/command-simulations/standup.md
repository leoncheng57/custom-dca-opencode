---
title: A standup with nothing invented
trigger: /standup
caveat: >-
  One day of a real log, shortened. The value is in what the command refuses to
  pad, which a busier day would show less clearly.
---

# Worked example

## user

/standup

## tool — bash

```
$ git log --all --author="you@example.com" --since="24 hours ago" --pretty=format:'%h %s' --no-merges
7ed8c02 feat: add simulation playback
779d9c2 feat: add session handoff skill
4699eaf feat: add human verification steps skill
$ gh pr list --author "@me" --state open --limit 10
(no open pull requests)
```

## assistant

**Yesterday**

- Skill pages now play their worked example as a timed transcript instead of a
  wall of text — autoplay, manual stepping, and a speed control.
- Two new skills landed: writing human verification checklists, and handing a
  session off to a fresh one with its settings intact.

**Today**

- Nothing is queued. Next is likely the command catalogue, but that is a guess
  from the direction of the last three commits, not from anything committed.

**Blocked**

- Nothing blocked.

## note

Three commits became two bullets. Nobody wants a commit list read aloud, and the
template asks for themes rather than a transcription.

The "Today" bullet is marked as a guess, because the log genuinely does not
contain it. The "Blocked" section says nothing is blocked rather than
manufacturing something to fill the heading.

This command has no skill behind it on purpose. It is small and self-contained,
so giving it a permanent slot in the agent's retrieval context would cost about
570 characters on every turn of every session to save typing a sentence.
