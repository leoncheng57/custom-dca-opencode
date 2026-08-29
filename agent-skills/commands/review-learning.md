---
description: Review code or a PR with findings first and exact learning excerpts
agent: plan
---

Review `$ARGUMENTS` as a senior engineer and turn the result into a concise
learning walkthrough. If no target is supplied, review the current diff. Honor
any requested subsystem or boundary first, such as authentication or an
external-runtime integration.

This command is self-contained. Do not load or defer to a skill. Do not change
code, post comments, open issues, or persist the walkthrough unless the user
explicitly asks after the review.

## Review before teaching

Inspect the complete diff and enough surrounding code, callers, tests,
configuration, and contracts to understand behavior across layers. For a PR,
review the whole change at its pinned head revision rather than only the latest
commit. Reproduce or run focused checks when safe and feasible.

Return findings first, ordered by severity. Each finding must contain:

- severity and a precise title;
- repository-relative `path:line-line` at the defect or risky behavior;
- concrete failure mode and affected user/system;
- evidence establishing the claim;
- the smallest useful remediation direction, without implementing it.

Separate `Verified findings` from `Unverified risks`. A verified finding is
supported by implementation, a reproducer, test output, or an authoritative
contract. An unverified risk names exactly what evidence is missing and the
cheapest check. Do not inflate educational observations into findings.

If there are no findings, say that explicitly before teaching and name residual
risks and test gaps. "No findings" never means "proved correct".

## Then teach from a small evidence set

After findings, select two to five high-value excerpts. Choose code that explains
an invariant, boundary, state transition, failure strategy, or non-obvious
tradeoff. Do not quote routine plumbing, the whole diff, or several snippets
that teach the same lesson.

For every excerpt:

1. give an exact repository-relative `path:line-line` verified against the
   reviewed revision;
2. quote the smallest contiguous source range that is independently readable;
3. state whether it is `Finding evidence` or `Educational`;
4. explain the engineering lesson and why the implementation shape matters;
5. connect it to the preceding and following layer;
6. state what the excerpt does not prove.

Use this output shape:

```text
Verified findings
1. [severity] Title — path:line-line
   Failure, evidence, remediation direction.

Unverified risks
- Risk — missing evidence; cheapest verification.

Layer map
HTTP route -> service/pool -> sidecar protocol -> external SDK

Learning excerpts
1. path:line-line — Finding evidence | Educational
   <minimal exact quote>
   Lesson: ...
   Connection: previous layer -> this code -> next layer.
   Does not prove: ...

Residual risks and test gaps
- ...
```

Adapt the layer map to the repository. Distinguish control flow from authority:
a route calling a service does not prove the service may trust browser input,
and a mock sidecar does not prove the external SDK behaves the same way. Keep
quoted lines exact, explanations concise, and educational value subordinate to
the correctness review.
