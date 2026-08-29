---
title: A finding gets a verified line citation
trigger: /cite-file-lines
caveat: >-
  One claim, one citation. A longer review would repeat this once per finding.
---

# Worked example

## user

/cite-file-lines why does an unknown reminder ID get rejected

## tool — bash

```
$ rg -n "isValidReminderId" server/routes/sessions.ts
118:  if (!isValidReminderId(reminder)) {
119:    return res.status(400).json({ error: "unknown reminder" });
```

## assistant

The prompt route rejects an unknown reminder ID with 400 before resolving any
trusted body (`server/routes/sessions.ts:118-119`).

## note

The line range came from reading the file, not from guessing at the function
name. The command itself carries the citation-selection and failure rules.
