---
title: Four independent axes, one synthesized answer
trigger: /deep-research
caveat: >-
  Agent prompts and reports are abbreviated. A real very-thorough pass spends
  most of its time reading citations and reconciling conflicting evidence.
---

# Worked example

## user

/deep-research how ready is this service for multi-tenancy

## assistant

This qualifies: four independent unknowns and three unrelated source areas.

Launching concurrently:

1. Database ownership columns and query predicates — `db/`, `server/queries/`.
2. Session identity and authorization — `server/auth/`, no database files.
3. Queues and caches — `server/queue/`, `server/cache/`, no auth files.
4. Deployment and prior art — `infra/`, `docs/`, git history, no app source.

Every prompt is read-only, very thorough, requires `file:line`, asks what does
not exist, and ends with `UNVERIFIED:`.

## tool — task

```
4 explore agents launched concurrently
```

## assistant

**Answer:** identity is already tenant-aware; enforcement is not. The session
carries `org_id` (`server/auth/session.ts:88`), but 17 queries omit an
organization predicate. The highest-risk gap is outside SQL: queue and cache
clients share one Redis keyspace with no prefix.

Two reports disagreed about queue isolation. I checked their citations: job
payloads carry an org id, but Redis keys do not, so the cache report is correct.

```
UNVERIFIED:
- production rows missing organization_id
- customers relying on cross-organization visibility
```

## note

The output is a synthesized answer, not four reports pasted under four headings.
The disagreement was resolved from evidence, and the unverified items stay
visible because either could change the design.
