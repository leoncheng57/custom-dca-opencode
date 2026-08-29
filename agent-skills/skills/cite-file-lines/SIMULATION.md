---
title: A claim gets a verified citation instead of a paraphrase
trigger: cite the lines
caveat: >-
  One claim, one citation. A real review would repeat this pattern once per
  finding rather than stopping after the first.
---

# Worked example

## user

Why does an unknown reminder ID get rejected? Cite the lines that prove it.

## tool — bash

```
$ rg -n "isValidReminderId" server/routes/sessions.ts
118:  if (!isValidReminderId(reminder)) {
119:    return res.status(400).json({ error: "unknown reminder" });
```

## assistant

The prompt route validates the requested reminder ID against the server-owned
catalogue before it ever resolves a body: an ID that fails `isValidReminderId`
is rejected with 400 before the trusted text is looked up
(`server/routes/sessions.ts:118-119`).

## note

The answer cites the branch that produces the rejection, not the route's
filename or a paraphrase like "there's some validation somewhere." The line
range was read from the actual file, not guessed from the function name.
