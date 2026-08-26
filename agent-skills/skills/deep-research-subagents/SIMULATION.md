---
title: Four agents on a multi-tenancy question
trigger: research this properly
caveat: >-
  One prompt is shown in full and the other three are summarised to their
  scope lines. The four reports come back over several minutes and are
  compressed here to the synthesis they produced.
---

# Worked example

## user

We need to add multi-tenancy. Research this properly before we design anything
— I want to know what we already have, what breaks, and what nobody has
thought about.

## assistant

Four axes, split so no two agents read the same files:

1. **Data layer** — schema, migrations, every query that would need a tenant
   filter.
2. **Auth and session** — where identity is established and what it carries.
3. **Background jobs and caches** — the places a tenant boundary is easiest to
   leak across.
4. **Prior art and config** — anything already half-built, plus how tenancy
   would be configured and deployed.

Launching all four concurrently.

## tool — task

```
task(subagent_type="explore", description="Multi-tenancy: data layer", prompt="
  READ-ONLY RESEARCH. Do not write or edit any files. Thoroughness: very thorough.

  Context: repo at ./, a single-tenant Node + Postgres app. We are scoping
  multi-tenancy. Three other agents cover auth, jobs/caches, and config —
  restrict yourself to db/, server/models/ and server/queries/, and do not
  read server/auth/ or server/queue/.

  Answer these, in order:
  1. What tables exist, and which hold user-owned data? file:line for the schema.
  2. Which queries would need a tenant predicate? Give a count and the files.
  3. Is there any existing column, index or constraint that could serve as a
     tenant discriminator today?
  4. What does NOT exist yet in this area?

  For every claim give file:line. Deliverable: one markdown section per
  question, answer first then evidence, under 800 words total.
  End with `UNVERIFIED:` listing anything you inferred or could not confirm.

  READ-ONLY. Do not write or edit any files.
")

task(subagent_type="explore", description="Multi-tenancy: auth",
     prompt="… restrict yourself to server/auth/ and server/middleware/; do
             not read db/ or server/queue/ …")

task(subagent_type="explore", description="Multi-tenancy: jobs and caches",
     prompt="… restrict yourself to server/queue/, server/cache/ and any
             Redis usage; do not read db/ or server/auth/ …")

task(subagent_type="explore", description="Multi-tenancy: prior art and config",
     prompt="… restrict yourself to config/, infra/, docs/ and the git log; do
             not read application source …")
```

## tool — bash

```
$ rg -n "tenant|organi[sz]ation" server/models/user.ts db/schema.sql
db/schema.sql:41:  organization_id  uuid  references organizations(id)
```

## assistant

**Answer first: the data layer is closer than expected and the cache layer is
the real problem.**

`db/schema.sql:41` already carries `organization_id` on `users`, added in a
2024 migration and never used for isolation. Nine of the eleven user-facing
tables can reach an organization in one join; the two that cannot —
`audit_events` and `uploads` — are the migration work.

Auth already resolves an organization: `server/auth/session.ts:88` puts
`org_id` on the session but nothing downstream reads it. So the identity half
is done and the enforcement half does not exist.

**Where the agents disagreed.** The jobs agent reported the queue as
tenant-safe; the config agent reported one shared Redis with no key prefix. I
read both citations — `server/queue/worker.ts:8` and `server/cache/client.ts:5`
open separate clients against the same `REDIS_URL` with no `keyPrefix`. The
jobs agent was looking at job *payloads*, which do carry an org id, and missed
the keyspace. The config agent is right; this is the highest-risk finding and
it is not in the database at all.

**What surprised me.** Nobody asked about `audit_events`, and it is the one
table with no path to an organization — an audit log that cannot be scoped is
a compliance problem, not a refactor.

```
UNVERIFIED:
- Whether the 2024 organization_id backfill covered all existing rows
  (migration 0042 has no backfill step; production data not inspected).
- Whether any customer currently relies on cross-organization visibility.
- Read-replica routing: infra/ references a replica but no config was found.
```

## note

Four agents, not two and not eight. Below three, do it yourself; above five the
synthesis costs more than the search saved.

All four went out in a **single message** so they run concurrently. Issued one
after another they would take four times as long and give none of the benefit.

Each prompt names what the agent may *not* read. Without that boundary they all
converge on whatever grep hits first and you pay four times for one answer.

The synthesis is not four reports under four headings. It leads with the
answer, resolves the disagreement by going and reading the cited lines rather
than picking a side, merges every `UNVERIFIED:` into one list, and keeps the
`file:line` citations so the reader can act without redoing the search.

The one bash call is a spot-check of a load-bearing claim — cheap, and it
catches a confidently-wrong report before it becomes a confidently-wrong answer.
