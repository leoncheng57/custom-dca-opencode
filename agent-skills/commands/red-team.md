---
description: Argue against the plan or diff just produced
agent: build
---

Red-team what you just produced. If `$ARGUMENTS` names a file or a plan, target
that; otherwise target your own most recent output.

Open with the side-switch, verbatim, as the first line:

> Red-teaming the work above. I am arguing against it.

Then:

1. Work all six objection classes — wrong problem, cheaper alternative, hidden
   coupling, operational cost, reversibility, the unchecked assumption. Say so
   explicitly when a class yields nothing.
2. Ground every objection in `file:line`, pasted command output, or a doc URL.
   Grep for the other callers rather than reasoning about them.
3. Keep objections you cannot ground in a separate, clearly labelled
   speculative bucket. Never mix them with grounded ones.
4. Rank the grounded objections by likelihood x cost-if-true x cheapness-to-check
   and present them as a table.
5. Close with the single cheapest experiment that would kill the work, and a
   verdict of exactly one of `proceed`, `proceed-with-change`, or `stop`.

Do not re-litigate the work's merits. The case for it has already been made.

For the full objection taxonomy, the ranking axes, and the failure-mode table,
load the `red-team-this` skill.
