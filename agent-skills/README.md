# OpenCode commands

Repository-owned Playbooks are explicit, human-invoked OpenCode slash commands.
Their source, worked simulations, parser, and documentation live here and are
built into the Runner's `/playbooks` catalogue.

The canonical public catalogue is
<https://leoncheng.dev/custom-dca-opencode/agent-skills/>. A trusted main-only
workflow generates a small commands-only static site; it does not rebuild the
retired standalone React app or publish the Runner SPA. The archived separate
repository owns <https://leoncheng.dev/agent-skills/>, and this repository's token
cannot add a redirect at that old URL.

This repository intentionally ships no skills. Model-retrieved skills place
descriptions in agent context before they are used, while a command costs zero
context until a human types `/name`. Each command therefore carries its complete
workflow, safety boundaries, edge cases, and failure handling rather than
deferring to another content type.

Runtime reminders under root [`reminders/`](../reminders/) are independent
application-owned, per-message instructions. Their prompt bodies remain in that
directory; command files are never used as reminder prompt sources. The live
OpenCode `/skill` Catalog panel is different again: it reports external skills
and commands loaded by the connected process for one project.

## Layout

```
commands/<name>.md              invocable command
command-simulations/<name>.md   worked transcript rendered by Playbooks
command-docs/<topic>.md         optional longer supporting examples
src/lib/                        build-time parser and command install helpers
```

Every `commands/*.md` file is auto-discovered. A command does not need a paired
reminder or any naming relationship, so adding a standalone command requires
only its command file and, normally, a same-named simulation.

## Format

```markdown
---
description: Shown in OpenCode autocomplete
agent: build          # optional: build | plan
model: provider/model # optional
subtask: true         # optional: run in a subagent
---

The complete procedure. $ARGUMENTS is substituted, !`cmd` output is injected,
and @path/to/file.ts is inlined before the model sees it.
```

Keep the body imperative and self-contained. Include preconditions, explicit
stopping rules, safety constraints, boundary cases, and responses to likely
failures. A command may be long; explicit invocation and zero at-rest retrieval
context are the reason it can own the full procedure without duplication.

## Install

Install globally:

```bash
mkdir -p ~/.config/opencode/commands
curl -sL https://raw.githubusercontent.com/leoncheng57/custom-dca-opencode/main/agent-skills/commands/verify.md \
  -o ~/.config/opencode/commands/verify.md
```

Or install for one project by writing the file under
`.opencode/commands/<name>.md`. Restart OpenCode after installation because the
connected process reads commands at startup. Playbooks only shows and copies
install commands; it never installs content itself.

## Simulations

All simulation frontmatter fields are required:

```markdown
---
title: Verifying a mixed UI change
trigger: /verify
caveat: The transcript omits the later human execution phase.
---

## user

/verify playbooks

## assistant

...
```

The trigger must be the exact slash command. Turns use `## user`,
`## assistant`, `## tool`, or `## note`, optionally followed by ` — <label>`.
Open on the human invocation, show the important guard or failure path, never
invent output, stay under 12 turns, and end at the procedure's real stopping
condition.

## License

MIT
