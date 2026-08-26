---
description: Fan one broad research question out across read-only agents
agent: build
---

Research this properly: `$ARGUMENTS`

First decide whether delegation pays. Use this command only when the question
contains at least three independent unknowns, spans unrelated files or sources,
or would require roughly twenty tool calls. For a needle lookup, do it inline.

If it qualifies:

1. Split it into 3–5 non-overlapping axes. Name what each agent owns and what it
   must not read so they do not converge on the first grep hit.
2. Launch all agents concurrently in one message. Use `explore` with
   "very thorough" for codebase research; use `general` read-only only when bash
   or another unavailable tool is genuinely required.
3. Every prompt starts and ends with READ-ONLY, supplies the absolute repository
   path, asks numbered questions, requires `file:line` or verbatim URL evidence,
   asks what does **not** exist, and ends with `UNVERIFIED:`.
4. Spot-check one load-bearing claim from each report yourself.
5. Synthesize rather than concatenate: answer the original question first,
   reconcile disagreements by reading the cited evidence, merge all unverified
   items, preserve citations, and say what surprised you.

Do not dispatch sequential questions whose later shape depends on an earlier
answer, and do not let research agents mutate state.

For escalation signals, prompt anatomy, fan-out limits, and synthesis failures,
load the `deep-research-subagents` skill.
