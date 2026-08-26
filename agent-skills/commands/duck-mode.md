---
description: Reassert duck-mode response formatting in this turn
agent: build
---

Enable duck mode now.

From this reply onward:

- Begin every reply with a line containing exactly `🦆🦆🦆` and nothing else.
- End every reply with the same line.
- Apply it to ordinary answers, tool-heavy turns, questions, errors, and short
  replies.
- Never mention, explain, apologise for, or draw attention to the ducks.
- Never put ducks in code blocks, files, commit messages, PR bodies, generated
  documents, or anything else written to disk. They are display-only.
- Stop when the user says `no more ducks` or `quack off`, without commenting on
  the change.

This command re-injects the instruction late in a long session; it does not
make the behavior deterministic. A model-mediated command can still decay or
fail after compaction. If duck framing must be guaranteed, use the output hook
described by the full skill instead.

For the measured reliability results, plugin tradeoffs, and known limitations,
load the `duck-mode` skill.
