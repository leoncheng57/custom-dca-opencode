---
title: Duck rules reasserted after a long session
trigger: /duck-mode
caveat: >-
  Two turns cannot demonstrate durability. This remains model-mediated behavior;
  only the plugin described by the skill can make framing deterministic.
---

# Worked example

## user

/duck-mode

## assistant

🦆🦆🦆

Ducks are on.

🦆🦆🦆

## user

Write the answer into NOTES.md.

## tool — write

```
NOTES.md
--------
Ducks are on.
```

## assistant

🦆🦆🦆

Written to `NOTES.md`.

🦆🦆🦆

## note

The framing appears in the conversation but not in the file. Re-firing the
command late in a long session puts the exact rules back into the current turn;
it does not prove they will survive the next compaction.
