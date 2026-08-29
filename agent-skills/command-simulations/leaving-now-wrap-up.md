---
title: A red but recoverable run is pushed and labelled honestly
trigger: /leaving-now-wrap-up
caveat: >-
  The repository inspection, secret scan, status write, and remote reread are
  compressed. The example shows one owned process and one unrelated dirty file.
---

# Worked example

## user

/leaving-now-wrap-up post what you have to the current pull request

## assistant

I am stopping only work this run owns, then I will preserve and report the
current state. I will not include the pre-existing `.env.local` change.

## tool — bash

```
$ kill 48120 && wait 48120
owned Playwright PID 48120 stopped
$ git status --short
 M .env.local
?? src/retry-policy.ts
?? tests/retry-policy.test.ts
$ npm test -- tests/retry-policy.test.ts
1 failed, 7 passed
failure: retry deadline is exceeded by 4 ms
```

## assistant

The focused test is red, but the two owned files are useful progress and the
user authorized a push. I am staging only those files; `.env.local` remains
untouched.

## tool — bash

```
$ git add src/retry-policy.ts tests/retry-policy.test.ts
$ git commit -m "wip: add bounded retry policy"
[feat/retry-policy 31b87da] wip: add bounded retry policy
$ git push -u origin feat/retry-policy
$ date -u +%Y-%m-%dT%H:%M:%SZ
2026-08-29T20:14:05Z
$ gh pr view 412 --json url,headRefName,statusCheckRollup
https://github.com/acme/app/pull/412
```

## assistant

Posted to the current pull request and refreshed `.agent-status.json` at
`2026-08-29T20:14:05Z`.

- Branch: `feat/retry-policy`
- Pushed: `31b87da`
- Stopped: owned Playwright PID 48120; unrelated processes were not touched
- Green: 7 focused assertions
- Red: retry deadline assertion exceeds the bound by 4 ms
- Local only: pre-existing `.env.local`, intentionally excluded
- Human decision: none; next owner should fix the deadline accounting and rerun
  the full suite

DO NOT MERGE: required focused verification is red.

## note

The command does not equate "wrap up" with "make the tree clean." It preserves
owned progress while leaving an unrelated local file alone, and it derives the
merge verdict from the reread remote state rather than from an earlier snapshot.
