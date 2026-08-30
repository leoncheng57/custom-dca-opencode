---
title: A long objective survives an assumption and a failed check
trigger: goal
caveat: >-
  Repository discovery, several implementation edits, and broad test output are
  abbreviated. The checkpoint updates represent boundaries across a longer run.
---

# Worked example

## user

**Workflow — Complete an objective autonomously**

finish CSV export, including tests and the empty state

## assistant

I found no repository-owned plan artifact, so I created
`/Users/you/.local/state/opencode-goals/app-csv-export.md` and mirrored its queue
in the session todo list.
The objective is complete when export escapes cells, preserves column order,
handles zero rows, and passes focused plus full verification.

Assumption A1: an empty result should download a header-only CSV. That is
reversible, matches the existing JSON export's stable schema, and needs no
security or destructive authorization, so I recorded it and continued.

## tool — bash

```
$ npm test -- tests/csv-export.test.ts
Tests  8 passed, 1 failed
FAIL empty export: expected "name,email\n", received ""
```

## assistant

The failure confirms the empty-state path bypasses the serializer. I updated the
checkpoint with the failure, fixed that path, and continued without asking for
permission to retry.

## tool — bash

```
$ npm test -- tests/csv-export.test.ts
Tests  9 passed
$ npm run typecheck
typecheck passed
$ npm test
Tests  247 passed
$ git status --short
 M src/export/csv.ts
 M tests/csv-export.test.ts
```

## assistant

Objective complete. The durable checkpoint is marked completed with the exact
commands above and restart state `none`.

- Acceptance criteria: 4/4 met
- Assumptions: A1, header-only empty export, implemented and documented
- Verification: focused 9/9, typecheck green, full suite 247/247
- Final diff: only the serializer and its focused test
- Remaining risk: spreadsheet formula interpretation is unchanged and outside
  this objective
- Local state: two modified files, not committed because no commit was requested

## note

The agent made a reversible product guess and documented it. It did not ask
"should I fix the test?" after a normal failure, and it did not confuse passing
the focused test with final completion.
