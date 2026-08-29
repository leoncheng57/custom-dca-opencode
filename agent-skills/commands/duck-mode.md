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
fail after compaction.

If framing must be guaranteed, use an output plugin on
`experimental.text.complete`, pin its behavior with a test, and accept that the
hook is undocumented and fires once per text part rather than once per response.
Such a plugin can guarantee duck presence but cannot stop the model discussing
them. Use persistent agent instructions for that generation rule. Never claim
post-compaction, interactive-TUI, cross-model, or future-version behavior was
verified unless it was exercised directly.

Always-on behavior belongs in a plugin, hook, or agent instructions rather than
in a command. This command is appropriate only for explicit, on-demand use.
