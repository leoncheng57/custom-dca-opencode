---
description: Draw an annotated ASCII diagram instead of a prose wall
agent: plan
---

Draw an ASCII diagram for `$ARGUMENTS`. If that is empty, diagram the plan,
change set, flow, or UI we are currently discussing.

Choose exactly one form:

- **Annotated file tree** for "what files change" — path, NEW/MOD/DEL status,
  then a comment only when it adds a design or coordination fact.
- **Vertical data flow** for "how does X reach Y" — boxes only for components,
  branches off the trunk, and failure modes attached where they bite.
- **UI mockup** for "what will it look like" — real copy, consistent widths,
  and the delta marked once with `NEW`.

Hard requirements:

1. Fence the diagram so a proportional font cannot destroy it.
2. Keep every line at or below 100 characters.
3. Align status columns and box edges across the whole diagram.
4. Put traps inline with `<-`; do not hide them in prose underneath.
5. Use realistic labels and counts, never lorem or placeholders.
6. Every annotation must say something the structure cannot already show.

Return the diagram first, then no more than five bullets explaining the
load-bearing choices. Do not use Mermaid unless the user explicitly asked for
a rendered diagram.

For character conventions, width checking, and the three complete formats,
load the `ascii-diagrams` skill.
