---
title: Turning a change set into an annotated tree
trigger: what files change
caveat: >-
  One diagram type of the three, and the width check is shown running once
  and passing. In practice the first draft usually fails it and the status
  column has to be re-cut.
---

# Worked example

## user

I'm about to open the PR for the webhook retry work. what files change?

## assistant

A tree, not prose: new-versus-modified is a column, and two of these carry a
trap a reviewer cannot see in the diff.

```
notifications-service/
├── src/webhooks/
│   ├── retry.ts                              NEW   pure: backoff calc, no I/O
│   ├── retryQueue.ts                         NEW   the ONLY place that enqueues
│   └── dispatch.ts                           MOD   + retry hook  ← also called by
│                                                     the digest job, which must
│                                                     NOT retry
├── src/config/limits.ts                      MOD   + maxAttempts  ← add to the
│                                                     allow-list in settings.ts
│                                                     or this is INERT at runtime
├── migrations/0043_webhook_attempts.sql      NEW   adds attempts column, no backfill
├── test/webhooks/retry.spec.ts               NEW   table-driven, 14 cases
└── docs/runbooks/webhook-failures.md         ---   discussed, deliberately excluded
                                                    from this PR
```

Three things worth your attention before review:

- `dispatch.ts` is shared with the digest job. The retry hook fires for both
  unless it is gated, and a retried digest sends duplicate email.
- `limits.ts` gains a key that does nothing until it is added to the settings
  allow-list. That is a silent no-op, not a crash.
- The migration adds `attempts` with no backfill, so existing rows are `NULL`
  and every comparison against them is false.

## tool — bash

```
$ python3 - <<'EOF'
L = open('/tmp/tree.txt').read().split("\n")
print("widest:", max(len(l) for l in L))
EOF
widest: 85
```

## note

The status column starts at one offset for the whole tree, chosen from the
longest path — `migrations/0043_webhook_attempts.sql` — not per subtree. A
column that shifts between branches reads as carelessness and costs the
diagram its credibility.

`---` is a third status meaning "discussed, deliberately excluded". Naming the
exclusion in the tree stops a reviewer asking for it.

Every annotation says something the structure cannot. `retry.ts NEW new file`
would be noise; `pure: backoff calc, no I/O` is a design decision. Two of the
notes wrap to a second line, and the continuation starts under the comment
column so paths and comments never blur together.

The two `←` traps are the whole point. Both are invisible in the diff: a shared
caller that must not inherit the new behaviour, and a config key that is inert
until an allow-list is extended. Each note sits on the line where it bites, not
in a paragraph underneath.

Width is counted in **characters**, not bytes — every box-drawing glyph is
three bytes in UTF-8, so `wc -c` lies by a factor of three. 85 clears the
100-column limit that terminals, PR panes and side-by-side diffs all clip at.
