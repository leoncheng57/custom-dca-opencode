---
title: Attacking a rate-limiter plan the agent just wrote
trigger: red team this
caveat: >-
  Four of the six objection classes are shown; the two that yielded nothing are
  named but not expanded. A real run also dispatches the red team into a fresh
  sub-agent context for anything larger than this diff.
---

# Worked example

## user

red team this

## assistant

Red-teaming the plan above. I am arguing against it.

Gathering evidence before I make claims.

## tool — bash

```
$ rg -n "RateLimit|rateLimit" server/ --type ts -l
server/middleware/rateLimit.ts
server/routes/auth.ts
$ rg -n "new Redis\(" server/
server/middleware/rateLimit.ts:12:const redis = new Redis(process.env.REDIS_URL!)
server/queue/worker.ts:8:const redis = new Redis(process.env.REDIS_URL!)
$ rg -n "keyPrefix|db:" server/middleware/rateLimit.ts server/queue/worker.ts
(no matches)
```

## assistant

**1. Wrong problem.** The complaint was *"the login endpoint falls over during
the morning spike"*. The plan rate-limits per IP. The spike is 4,000 legitimate
users on a corporate NAT, so per-IP limiting throttles the customer, not an
attacker. Grounded: the original issue text, quoted above.

**2. Cheaper alternative.** `server/routes/auth.ts` already imports
`express-rate-limit` for the password-reset route. Reusing it is a config
change; the plan adds a new middleware module.

**3. Hidden coupling.** Two `new Redis()` clients, no `keyPrefix` and no `db:`
selector on either. The limiter and the job queue share one keyspace, so a
limiter key named `user:123` can collide with a queue key. This is invisible in
the diff.

**4. Assumption.** The plan assumes `REDIS_URL` points at a Redis the limiter
may flush. `server/queue/worker.ts:8` says otherwise.

No wrong-abstraction finding. No reversibility problem — the middleware can be
removed in one commit.

## assistant

| # | Class | Objection | Evidence | L | C | Chk | Score |
|---|---|---|---|---|---|---|---|
| 1 | Wrong problem | Per-IP limiting throttles a NAT'd office, not an attacker | issue text; plan §1 | 5 | 5 | 4 | 100 |
| 2 | Coupling | Limiter and queue share a Redis keyspace, no prefix | `rateLimit.ts:12`, `worker.ts:8` | 4 | 4 | 5 | 80 |
| 3 | Cheaper alt | `express-rate-limit` already a dependency | `routes/auth.ts` | 3 | 2 | 5 | 30 |

## assistant

**Speculative (unverified — no evidence gathered)**

- The morning spike may be retries from a mobile client rather than distinct
  users. Did not verify; would need the access log, which I cannot reach.

> Cheapest kill: `redis-cli --scan --pattern 'bull:*' | head -1` against the
> same URL — if the queue's keys are in there, objection 2 is confirmed and the
> plan needs a `keyPrefix` before anything else. 10 seconds.

**Verdict: proceed-with-change.** Key the limiter on account ID rather than IP,
and give both Redis clients an explicit `keyPrefix`. The plan's structure is
fine; its key choice solves a different problem than the one reported.

## note

The side-switch is the first line, before any analysis. Without it the model
defends the plan it just wrote — the reasoning that produced it is still in
context and still feels correct.

Every objection in the ranked table cites a `file:line` or a command that was
actually run. The one objection that could not be grounded is in its own
labelled bucket, because an unsourced objection stated with the same confidence
as a sourced one is how a red team becomes noise and gets ignored wholesale.

Two classes are explicitly reported as empty. "No wrong-abstraction finding" is
a result; silently skipping the class looks identical to not having checked.

Note the ranking is not the order the objections were found in. Sorting by
likelihood × cost × cheapness-to-check puts the ten-second check on the
plausible, expensive problem first.
