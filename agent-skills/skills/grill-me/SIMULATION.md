---
title: Stress-testing a Redis cache plan
trigger: grill me
caveat: >-
  Round 1 only, and its frontier is four questions rather than the eight a real
  design of this size produces. The session continues for three to five more
  rounds before the frontier empties.
---

# Worked example

## user

I want to put a Redis cache in front of `GET /products` — it's our slowest
endpoint. Plan is: cache the serialized JSON, 5 minute TTL, invalidate on
write. Grill me on it before I start.

## assistant

Four questions on the frontier. Q5 (key sharding) depends on your answer to
Q2, so it waits for round 2.

❓ **Q1** — **TTL and invalidation together?** You have both a 5-minute TTL
*and* write invalidation. Those solve different problems: the TTL bounds
staleness from writes you *miss*, invalidation removes staleness from writes
you *catch*. Running both is fine, but only if you can say which one is the
correctness guarantee and which is the backstop.

➡️ Invalidation is the guarantee, TTL is the backstop — and set the TTL much
longer, an hour or more. A 5-minute TTL on a working invalidation path just
throws away 90% of your hit rate for a safety net you hope never catches
anything.

---

❓ **Q2** — **What is the cache key?** `GET /products` almost certainly takes
query parameters. If the key is the path alone, two users with different
filters get each other's results — that is a correctness bug, not a
performance one.

➡️ Key on the normalized query string, with parameters sorted and unknown
ones dropped. If any response varies by user (pricing tier, locale,
permissions), that dimension has to be in the key too, and you should say so
now rather than discover it in production.

---

❓ **Q3** — **Is the endpoint slow because of the database?** Caching a slow
endpoint helps only if the slowness is in work the cache can skip. If the
2 seconds is serialization or a fan-out to another service *after* the query,
the cache still helps; if it is a missing index, the cache hides a one-line
fix behind a new piece of infrastructure.

➡️ I do not know yet, so I looked. See the tool call below — nothing is
caching this today and the query is unbounded. Answer Q3 with a trace before
committing to Redis.

---

❓ **Q4** — **What happens when Redis is down?** Two options: fail the request,
or fall through to the database. Fall-through is the obvious answer until you
consider that a cache outage then delivers your full uncached load to a
database that has been sized for the cached load.

➡️ Fall through, but behind a circuit breaker and a concurrency limit on the
database path. Unqualified fall-through converts a cache outage into a
database outage, which is strictly worse than serving errors from one endpoint.

## tool — bash

```
$ rg -n "cache|redis" server/routes/products.ts
44:  // TODO: cache this
$ rg -n "limit|LIMIT" server/routes/products.ts
(no matches)
```

## note

Four questions go out together because all four are answerable now. Q5 depends
on Q2's answer, so asking it in this round would force a hypothetical answer —
and hypothetical answers settle nothing.

Q3 needed a fact about the codebase, not a decision from the user, so it was
looked up rather than asked. Facts are the agent's job; decisions are the
user's.

Every question carries a recommendation. A question without one hands the
thinking back to the user, which is the opposite of the point.
