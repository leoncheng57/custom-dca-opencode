---
title: A diagram medium chosen for where the reader will open it
trigger: docs-and-diagram-tooling
caveat: >-
  The document itself is abbreviated. The point is the choice of medium and the
  refusal to maintain the same diagram twice.
---

# Worked example

## user

document how a notification becomes a push, for the README and for the
onboarding slides

*Reminder attached: Choose Documentation Visuals*

## assistant

Two surfaces with different rendering, so the medium is not one decision.

The shape is a pipeline with branches — record, suppress or deliver, then fan
out per channel. That is a flow, so it is a diagram rather than a table. A table
would be right for comparing the channels, which is a different question.

## note

GitHub renders Mermaid, so the README can hold the source. Slides do not, so
they need a fixed image.

## assistant

Rather than maintain the same diagram twice, I am keeping ONE Mermaid source in
the README and exporting the SVG for the slides from it. Two hand-maintained
copies drift, and the drift is invisible until someone quotes the stale one.

## tool — bash

```
$ npx @mermaid-js/mermaid-cli -i docs/notification-flow.mmd -o docs/notification-flow.svg
  wrote docs/notification-flow.svg
```

## assistant

Checked a neighbouring document first and matched its heading depth and its
habit of citing the implementing file under each diagram.

Cited `server/notifications/service.ts` for the suppression branch, and stated
the limitation plainly: the diagram shows the delivery decision, not retry or
expiry behaviour, which live elsewhere and would make it unreadable.

Rendered the SVG before claiming it works.
