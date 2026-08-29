---
description: Produce a five-minute transcript-first technical design narrative
agent: plan
---

Write a mini design doc for `$ARGUMENTS`. If no subject is supplied, use the
medium-sized technical or product decision currently under discussion.

This command is self-contained. Do not load or defer to a skill. The result
belongs in the current transcript, must take less than five minutes to read, and
must not create files or expand into a multi-artifact RFC unless explicitly
requested.

Inspect the relevant code, callers, tests, contracts, and existing decisions
before recommending anything. Identify the single decision the reader needs to
make. Label load-bearing statements as `Verified`, `Inferred`, or `Proposed`
when prose alone could blur their status, and cite repository-relative
`path:line-line` or primary sources for claims that determine the decision.

Use the smallest useful subset of this sequence:

1. **Today / Problem:** concrete current behavior and the friction or failure.
2. **Proposed Experience or Design:** make the target state tangible.
3. **Flow:** trace the main user action, request, state, or data path.
4. **Rules and Boundaries:** accepted/rejected inputs, trust and authority,
   state ownership, constraints, and the expensive direction to be wrong.
5. **Alternatives:** compare only credible options on decision-relevant axes.
6. **Why Not:** reject the most tempting oversized or unsafe choice with facts.
7. **Scope Split:** `Now`, `Later`, and `Non-goals`.
8. **Recommendation:** one clear sentence naming the central choice and why.

Omit a section that adds no decision value. Do not fill headings to imitate
rigor, pad alternatives with strawmen, or repeat a diagram in prose.

Use compact ASCII only when spatial grouping, sequence, side-by-side comparison,
architecture, or a UI sketch is faster to understand than prose. Prefer at most
one current/target comparison and one execution flow. Use realistic names,
values, and actions; annotate risks at the step where they occur; keep lines at
or below 100 columns when practical. Use a compact table for alternatives and a
short list for linear scope or acceptance rules.

Explicitly cover security, mobile, accessibility, operations, compatibility,
and dependencies only when they can change the choice. Keep follow-up work
separate from the immediate recommendation. End with the recommendation, not a
generic summary or an open-ended list of options.
