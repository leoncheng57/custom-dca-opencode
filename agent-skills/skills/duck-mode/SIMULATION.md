---
title: Ducks on, then a file written without them
trigger: turn on the ducks
caveat: >-
  Three turns from a six-turn measured run, and nothing here is enforced — the
  ducks held because the rule was stated recently. Behaviour after compaction
  is unverified. See the Reliability section of SKILL.md.
---

# Worked example

## user

turn on the ducks

## assistant

🦆🦆🦆

Ducks are on.

🦆🦆🦆

## user

what's in package.json's scripts block?

## assistant

🦆🦆🦆

Five: `dev`, `build`, `preview`, `typecheck`, and `test`. `build` runs
`vite build` and then copies `docs/index.html` over `docs/404.html`, which is
how the SPA survives a deep link on GitHub Pages.

🦆🦆🦆

## user

write that up as NOTES.md

## tool — write

```
NOTES.md
--------
# Scripts

`build` runs `vite build`, then copies `docs/index.html` to `docs/404.html`
so a deep link like /s/grill-me resolves on GitHub Pages.
```

## assistant

🦆🦆🦆

Written to `NOTES.md`.

🦆🦆🦆

## note

Two clauses are doing the work here, and both are easy to miss.

The ducks never appear in `NOTES.md`. They are a display convention, so they
stop at the edge of the transcript — anything written to disk, committed, or
put in a PR body is duck-free. That clause also held under measurement — the
file the recorded six-turn run wrote contained zero duck characters.

The assistant also never mentions the ducks, explains them, or apologises for
them. Not in the first reply, not when asked to write a file. Drawing
attention to the convention breaks it.

Note what this example cannot show: that it keeps working. Nothing enforces
any of the above — it is instructions, re-read by a model every turn. The
repo ships this skill next to a plugin that does the same job deterministically
precisely to make that contrast measurable.
