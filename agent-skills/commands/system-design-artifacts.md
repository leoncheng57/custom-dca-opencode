---
description: Build an evidence-led senior system-design review package
agent: build
---

Create a senior-SWE system-design review package for `$ARGUMENTS`. If the
subject is omitted, use the system or proposal currently under discussion.

This command is self-contained. Do not load or defer to a skill.

## Establish the assignment

Before writing, state one mode:

- `current-state`: explain only behavior supported by present evidence;
- `target-state`: design proposed behavior without presenting it as shipped;
- `mixed`: keep current and target views visibly separate in every artifact.

Identify the audience, decision they need to make, repository boundary, and
whether the user requested transcript output, repository files, or publication.
Do not create files or publish anything unless requested. Never publish directly
to a default branch. If publication is requested, use a draft PR.

## Audit evidence first

Inspect the relevant implementation, callers, tests, fixtures, schemas/live
contracts, decisions, incidents, and operational configuration. Prefer the live
contract over secondary documentation when the repository says it is
authoritative. Do not run destructive probes, production operations, migrations,
or writes merely to strengthen a document. Ask before a probe that has cost,
external effects, credentials, or production reach.

Tag important claims in notes and artifacts with exactly one evidence class:

| Class | Meaning |
| --- | --- |
| `observed` | Reproduced by a named command or live probe, with environment and date |
| `code-supported` | Directly established by cited implementation or tests |
| `mock-only` | Demonstrated only by a fixture, fake, simulator, or test double |
| `inferred` | Best explanation from evidence, but not directly established |
| `unknown` | Evidence is absent, contradictory, inaccessible, or intentionally unprobed |

Mocks never prove live upstream behavior. A test proves only the contract it
actually exercises. Keep proposed behavior out of current-state claims. Cite
repository-relative `path:line-line`, a command plus bounded output, or a primary
source URL for every load-bearing claim.

## Build the system model

Before selecting artifacts, identify:

1. system and trust boundaries;
2. state owner for every important datum;
3. durable, process-local, derived, cached, and presentation-only state;
4. authority and permission checks at each mutation boundary;
5. concurrency units, serialization points, dedupe keys, replay, and idempotency;
6. lifecycle state separately from transport events and UI presentation;
7. failure boundaries, restart reconciliation, partial success, and rollback;
8. the expensive direction to be wrong for each uncertain decision.

Write down the load-bearing invariants. Examples of useful invariant shapes are
"absence from a process-local status map is not proof of idle" and "a browser
candidate grants no authority until the server validates it". Use repository
facts, not these examples, in the package.

## Select artifacts; do not generate a checklist blindly

Start with a manifest and include an artifact only when it gives a distinct
review perspective:

```yaml
mode: current-state | target-state | mixed
subject: <specific system or decision>
audience: senior-swe
decision: <what the reviewer must decide or understand>
evidence:
  live_probes: required | optional | prohibited
  destructive_actions: prohibited-by-default
artifacts:
  - id: <artifact-id>
    question: <unique review question this artifact answers>
    evidence_classes: [observed, code-supported]
omissions:
  - artifact: <catalogue item>
    reason: <why it adds no distinct review value>
```

Use this selection logic:

| Review question | Prefer |
| --- | --- |
| Why does the system behave this way? | executive system guide or implementation RFC |
| What changes between now and target? | paired architecture/data-flow diagrams |
| Which transitions are legal? | state machine plus normative transition table |
| What crosses a boundary? | API contract, sequence diagram, and data model |
| Who owns and persists state? | ownership/persistence matrix |
| What happens on crash, retry, or restart? | failure/reconciliation diagram and catalogue |
| What can an attacker or confused deputy do? | threat model and security-test matrix |
| Why this choice? | focused ADRs for consequential alternatives only |
| How can this ship safely? | dependency graph, milestones, migration, rollout, rollback |
| How will operators know? | signals, SLOs, alerts, dashboards, and runbook |
| How can a reviewer safely verify it? | non-destructive lab or commands with expected output |
| Does interaction or motion carry the idea? | responsive HTML, accessible SVG, or short demo |

Do not create interactive HTML, animation, video, or a machine-readable failure
catalogue unless the medium itself answers a review question. Decorative copies
of prose are omissions, not deliverables.

## Artifact contracts

Every selected artifact begins with: purpose, mode, evidence classes used,
authoritative sources, uncertainties, and links to related artifacts. Then apply
the relevant contract:

- **Guide/RFC:** problem and decision first; explain causality, invariants,
  boundaries, ownership, failure behavior, and consequences.
- **Diagram:** include a legend; label authority/state boundaries; annotate races
  and failure points where they occur; pair mixed-mode views instead of blending
  them.
- **State table:** name state owner and persistence; include trigger, guard,
  transition, side effect, retry/idempotency behavior, invalid transition, and
  restart outcome.
- **API/data contract:** include caller, authority, validation, request/response,
  errors, idempotency, compatibility, limits, and redaction. Mark illustrative
  schemas as proposals.
- **Ownership matrix:** include datum, authority, writer, readers, persistence,
  cache/derivation, reconciliation, and deletion/retention.
- **Threat model:** identify assets, actors, entry points, trust boundaries,
  abuse cases, mitigations, residual risk, and executable security checks.
- **ADR:** one decision and status; context, credible alternatives, choice,
  consequences, reversibility, and evidence that would reopen it.
- **Implementation plan:** order by dependencies; name ownership, acceptance
  evidence, rollout gates, migration, rollback, and intentionally deferred work.
- **Operations:** connect each SLO and alert to a user-visible failure, then give
  diagnosis, safe mitigation, escalation, and recovery verification.
- **Failure catalogue:** stable scenario ID, preconditions, injection, expected
  state/events, invariant, observability, cleanup, and safety classification.
- **Interactive artifact:** keyboard and touch operation, reduced motion,
  semantic structure, no secret/live data, responsive checks, and a static
  fallback carrying the same information.

## Link and verify the package

Create one index with a recommended review order. For each artifact list its
question, mode, evidence status, prerequisite, and unresolved gaps. Cross-link
concepts by stable anchors or relative paths. Do not make the reviewer hunt for
the current/target boundary or the source behind a claim.

Verify only what exists:

1. check every cited path and line range against the reviewed revision;
2. lint/parse Markdown, Mermaid, YAML, JSON, OpenAPI, and HTML with repository
   tooling where available;
3. execute safe examples and contract validation in an isolated environment;
4. render diagrams and inspect labels, clipping, and legibility;
5. test interactive output at desktop and mobile widths, keyboard-only, screen
   reader semantics, contrast, and reduced motion;
6. run relevant repository typechecks/tests and record exact commands/results;
7. list anything not run and why; never turn "not checked" into "passed".

Return or commit only the requested output. If a draft PR was requested, ensure
it clearly says `Draft`, separates current facts from proposals, links the
package index, reports verification and gaps, includes human verification steps,
and does not claim that opening the PR deploys or operates the system.
