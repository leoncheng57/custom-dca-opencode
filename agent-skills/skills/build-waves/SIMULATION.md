---
title: A wave boundary, mid-run
trigger: do not stop until it is done
caveat: >-
  One boundary out of six from a run that took hours. The waves before and
  after it, the compaction, and the model change are all elided — this shows
  the loop, not the duration.
---

# Worked example

## user

Migrate the reporting service off the legacy schema. Build all of it, do not
stop until it is done.

## tool — bash

```
$ test "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-}" = true && echo ok
ok
$ npm run typecheck && npm test && npm run build
Tests  486 passed (486)
✓ built
```

## assistant

Baseline green at 486 tests. Writing the plan file before launching anything —
the parent context is the one thing that cannot be restarted, so the queue has
to live on disk.

`docs/migration-plan.md` now holds scope, per-wave ownership, artifact
boundaries, and the exact verification commands. Six waves, cut so no two
tasks touch the same files:

```
wave 0  schema + migrations        db/                    done
wave 1  query layer                server/queries/        done
wave 2  report renderers           server/reports/        ← current
wave 3  API surface                server/routes/
wave 4  client                     client/reports/
wave 5  VERIFICATION               planned up front, not cleanup
```

All six are in `todowrite`, including wave 5. Only wave 2 is marked active.

## note

Wave 5 exists before wave 2 starts. Verification planned after the last edit is
cleanup, and cleanup gets cut when the run gets long. The exit condition is all
planned verification passing, not the last feature file being written.

## assistant

Wave 2 is mine to write. Launching wave 3's research now so it overlaps with
this wave's implementation rather than following it.

## tool — task

```
task(subagent_type="explore", description="Research report routes", background=true,
     prompt="READ-ONLY. Inventory every route in server/routes/ that returns
             report data: path, handler, response shape, and which query
             functions it calls. Cite file:line. Do not read server/reports/ —
             another process is editing it. End with UNVERIFIED:.")
→ ses_7c1
```

## assistant

Wave 2 complete: eleven renderers moved, `server/reports/legacy/` deleted.

```
$ npm run typecheck && npm test
Tests  486 passed (486)
```

Wave 3's research came back while I was working — the routes inventory found
two endpoints nobody listed in the original scope, both reading the legacy
tables directly. Added to the plan file as wave 3 tasks; the scope grew and
the durable record grew with it.

Marking wave 2 done in `todowrite`, wave 3 active, and starting wave 3 now.

## note

No "shall I continue?" here. A progress report is not a handoff of control —
stopping after every wave to ask turns a sustained run back into the series of
mini-projects the skill exists to prevent.

There are exactly three reasons to stop: a real product, scope, safety or
destructive-action decision; a verification failure that must be assessed
before a fix wave is cut; or every wave including verification being green.
Two surprise endpoints are none of those. They are a plan-file edit.

Children explore, the parent writes. Wave 3's research ran read-only, in the
background, against files the parent was not touching, and its only output was
a compressed cited report — the parent kept the cross-wave design and every
edit.

Note what this transcript cannot show. The measured run behind this skill went
7.5 hours and 254 messages, compacted once at 90% context, and changed model
mid-run. It kept its place because the queue was in a file and in `todowrite`,
not in the context window. That is the property the boundary above is
protecting, and one boundary cannot demonstrate it.
