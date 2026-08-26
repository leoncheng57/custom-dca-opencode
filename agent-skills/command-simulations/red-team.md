---
title: Turning on your own diff
trigger: /red-team
caveat: >-
  Two objection classes are shown of the six the template asks for, and the
  ranked table is trimmed to two rows.
---

# Worked example

## user

/red-team

## assistant

Red-teaming the work above. I am arguing against it.

## tool — bash

```
$ rg -n "frameDelayMs|setTimeout" src/ --type ts
src/lib/simulationPlayback.ts:24:export function frameDelayMs(speed: Speed)
src/components/SimulationPanel.tsx:79:  const timer = window.setTimeout(
$ rg -n "prefers-reduced-motion" src/
src/styles/globals.css:47:@media (prefers-reduced-motion: reduce) {
src/components/SimulationPanel.tsx:39:  window.matchMedia('(prefers-reduced-motion: reduce)')
```

## assistant

**Unchecked assumption.** The autoplay timer assumes the tab is visible.
`SimulationPanel.tsx:79` sets a timeout with no `visibilitychange` guard, so a
backgrounded tab still advances frames and a reader returning after two minutes
finds the transcript finished. Nothing in the diff addresses this.

**Operational cost.** Every skill page now mounts a timer on load, because the
section is open by default. That is twelve pages each starting a repeating
timeout the moment they render, and no test covers what happens when a visitor
opens several in tabs.

No hidden coupling found — `frameDelayMs` has exactly one caller. No
reversibility problem; this is pure presentation and reverts in one commit.

| # | Class | Objection | Evidence | L | C | Chk | Score |
|---|---|---|---|---|---|---|---|
| 1 | Assumption | Backgrounded tabs still advance | `SimulationPanel.tsx:79` | 5 | 3 | 5 | 75 |
| 2 | Operational | Timer starts on every page load | open-by-default in `SkillRoute.tsx` | 4 | 2 | 4 | 32 |

> Cheapest kill: open a skill page, switch tabs for 60 seconds, come back. If
> the transcript is at the last frame, objection 1 is confirmed. 60 seconds.

**Verdict: proceed-with-change.** Pause the timer on `document.hidden`. The
rest is fine.

## note

The side-switch is line one, before any evidence. Without it the model defends
what it just built, because the reasoning that produced it is still in context.

Both objections cite a line that was actually grepped. The two classes that
found nothing are reported as empty rather than skipped — silently omitting a
class looks identical to not having checked it.

The verdict is `proceed-with-change`, not `stop`. A red team that never clears
anything gets discounted.
