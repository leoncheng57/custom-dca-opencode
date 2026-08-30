---
title: Selecting a mixed-state queue review package
trigger: system-design-artifacts
caveat: >-
  The transcript shows package selection and evidence discipline, not the many
  linked files or rendered artifacts that a real requested package would contain.
---

# Worked example

## user

**Workflow — Build a system-design review package**

document the current queue and propose durable replay

## tool — grep

Searched queue ownership, event subscription, persistence, reconnect, and replay
terms in the server, client, tests, and architecture decisions.

## assistant

Mode: `mixed`. The current-state and target-state views will be paired, never
combined into one ambiguous diagram.

Decision: reviewers need to decide whether durable replay is justified and where
its watermark belongs.

Evidence ledger:

| Claim | Class | Evidence |
| --- | --- | --- |
| reconnect refetches state | `code-supported` | `client/lib/events.ts:88-112` |
| classic SSE has no cursor | `observed` | live OpenAPI probe, 2026-08-29 |
| fixture replays missed events | `mock-only` | `tests/mock-server.ts:410-438` |
| a durable watermark closes every gap | `unknown` | retention semantics unprobed |

Selected package:

1. System guide: explains current ownership, transport, and why refetch exists.
2. Paired current/target sequence diagrams: isolates the proposed watermark.
3. Ownership matrix: answers who persists cursor, events, and projections.
4. Failure catalogue: disconnect during write, expired cursor, duplicate replay,
   and restart between persistence and delivery.
5. ADR: compares refetch-only, bounded replay, and full event sourcing.
6. Rollout/runbook: shadow watermark, mismatch signal, rollback to refetch.

Omitted: interactive HTML and animation add no review perspective; an OpenAPI
contract is deferred until the target endpoint is chosen.

Review order: system guide -> paired sequences -> ownership matrix -> failure
catalogue -> ADR -> rollout. Every target artifact will carry a `Proposed`
banner and link back to the current-state source evidence.

## note

The mock claim remains explicitly mock-only even though it demonstrates the
desired UX. Artifact omissions are deliberate and reviewable rather than silent.
