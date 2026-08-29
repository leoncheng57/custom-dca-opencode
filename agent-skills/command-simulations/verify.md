---
title: Checks run before the human is asked to look
trigger: /verify
caveat: >-
  The checklist is trimmed to four steps; a real one runs to eight or ten. This
  fixture repository uses npm, but the command discovers tooling before checks.
---

# Worked example

## user

/verify the playback controls

## tool — bash

```
$ npm run typecheck
$ npm test
Tests  202 passed (202)
Tests  24 passed (24)
$ npm run build
✓ built in 1.4s
$ git status --short && git diff --stat HEAD
 M src/components/SimulationPanel.tsx      | 118 ++++++--
 M src/components/simulation-panel.module.css | 96 +++++-
```

## assistant

All three green, so this is worth a human pass.

**1. Autoplay starts unprompted.** Open `/s/grill-me`. The simulation section is
already expanded and frame 1 is showing. Within ~10s a second turn appears with
no interaction. *Failure signal:* nothing moves, or every turn is visible at once.

**2. Assistant text is orange, user text green.** Same page. *Failure signal:*
both the same colour, or code inside an assistant turn is unreadable.

**3. Manual navigation pauses autoplay.** Press Next. The status line reads
`paused`. Wait 15s — no further advance. *Failure signal:* it keeps advancing.

**4. Reduced motion does not autoplay.** System Settings → Accessibility →
Reduce motion, reload. Section still open, frame 1 visible, controls still work,
status says autoplay is off. *Failure signal:* frames advance anyway.

```
VERIFIED    typecheck, tests, build
UNVERIFIED  everything above — I ran the commands, I did not open a browser
```

Disposition: **Blocked on human access** for the visual steps.

## note

The assistant first inspected this repository's instructions, package manifest,
lockfile, CI, and changed tests. Those sources established npm and the three
commands shown above; the portable command did not assume them.

The automation gate remains load-bearing: a red build never reaches a human.

Note the honest split at the end. Running the commands is not the same as
looking at the page, and the report says so rather than claiming a pass.
