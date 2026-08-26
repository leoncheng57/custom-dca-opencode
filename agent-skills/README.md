# Agent skills and commands

Portable [agent skills](https://opencode.ai/docs) — reusable workflow instructions
that a coding agent loads on demand when a task matches the skill's description.

This content collection is maintained as part of
[`custom-dca-opencode`](https://github.com/leoncheng57/custom-dca-opencode). It is
written for [OpenCode](https://opencode.ai), and compatible with any agent that
reads `SKILL.md` files with YAML frontmatter (Claude Code included).

Browse it in the Runner's native **Playbooks** page at `/playbooks`. This directory
contains installable Markdown and its parsers; it is deliberately not a separate
SPA, npm workspace, or deployment.

## Skills

The Playbooks page discovers every `skills/*/SKILL.md` directly, so its inventory
cannot drift from this directory.

## Install

Install with the [skills CLI](https://skills.sh/):

```bash
npx skills add https://github.com/leoncheng57/custom-dca-opencode/tree/main/agent-skills
```

Or clone the repository and symlink individual skills into your agent's skills
directory for automatic updates:

```bash
git clone https://github.com/leoncheng57/custom-dca-opencode.git ~/Documents/Projects/custom-dca-opencode

NAME=parallel-research-handoff

# OpenCode
cd ~/.agents/skills && ln -s ../../Documents/Projects/custom-dca-opencode/agent-skills/skills/$NAME $NAME

# Claude Code
cd ~/.claude/skills && ln -s ../../Documents/Projects/custom-dca-opencode/agent-skills/skills/$NAME $NAME
```

Symlinks mean `git pull` updates the live skill. Use **relative** targets, as
above — `../../` from `~/.agents/skills` resolves to your home directory, so the
link survives a different username or machine. An absolute target bakes in
`/Users/<you>` and breaks on the next machine.

**Restart OpenCode after installing.** Skills are read at startup and are not
hot-reloaded, so a newly symlinked skill is invisible to the running session.

Project-scoped alternative: drop a skill under `.opencode/skills/<name>/SKILL.md`
inside a repo so it only loads there.

## Format

```
skills/<name>/SKILL.md
```

```markdown
---
name: <name>
description: <what it does> + <when to use it, including trigger phrases>
---

<the instructions>
```

The `description` is the only part always in the agent's context — it is what
decides whether the skill gets loaded. Write it for retrieval: say what the
skill does *and* name the situations and phrases that should trigger it.

Keep the body imperative and specific. Concrete commands, real file paths, and a
failure-mode table beat general advice.

## Worked examples

A skill directory may also hold a `SIMULATION.md`: one short, hand-written
transcript of the skill firing. Playbooks renders it as a **Simulation Example**
section above the instructions, and the file travels with the skill on install,
so the agent can read it on demand too.

It lives beside `SKILL.md` rather than inside it because `SKILL.md` is agent
context — every line is injected into the model when the skill loads. A
transcript there is pure token cost, and models imitate an example's literal
content instead of following the procedure.

```
skills/<name>/
├── SKILL.md          required
└── SIMULATION.md     optional
```

````markdown
---
title: Stress-testing a Redis cache plan
trigger: grill me
caveat: >-
  Round 1 only. A real session runs three to five rounds.
---

## user

I want to put a Redis cache in front of `GET /products`. Grill me on it.

## assistant

❓ **Q1** — **TTL and invalidation together?** …

## tool — bash

```
$ rg -n "cache|redis" server/routes/products.ts
44:  // TODO: cache this
```

## note

The whole frontier goes out in one round. Q5 depends on Q2, so it waits.
````

All three frontmatter fields are required. `trigger` is the literal phrase that
fires the skill and is checked against both the first user turn and the
`description` — rename a trigger and the build fails rather than leaving a stale
example behind. `caveat` names what the transcript compresses and is rendered in
the panel, not hidden in frontmatter.

Turns are `## user`, `## assistant`, `## tool`, `## note`, optionally followed by
` — <label>` (em dash). The first turn must be `user`. `note` is editorial: it
explains *why* the assistant did that, and is never attributed to the assistant.

Authoring rules, in rough order of how often they are broken:

1. **Open on a documented trigger phrase, verbatim.** Not a paraphrase.
2. **Show the guard, not just the happy path.** If a skill exists to prevent a
   failure, the transcript has to reach that failure. An example of
   `background-subagent` that skips the env-flag check models the exact mistake
   the skill prevents.
3. **Truncate, never invent.** Mark elisions with a `note`. Never fabricate a
   file path, PR number, or command output that could not have occurred.
4. **Real copy, never lorem.** `( 3 enabled )` communicates; `(N enabled)` does
   not.
5. **Twelve turns maximum.** Past that the example is trying to be the
   instructions.
6. **End on the skill's real stopping condition** — not on "and then it worked".
7. **Only cite numbers already in `SKILL.md`.** Invented timings are not
   evidence.
8. **No headings inside a turn body.** They collide with the instruction body's.

Finally, add a short `## Worked example` section to `SKILL.md` pointing at the
file, the way `ascii-diagrams/SKILL.md` points at its `EXAMPLES.md`.

`skills/grill-me/` is the reference implementation of all of the above.

## Custom commands

Alongside the skills, this repo ships **OpenCode custom commands** — single
markdown files you fire by typing `/name` in the TUI.

```
commands/<name>.md              the command itself
command-simulations/<name>.md   its worked example (Playbooks + docs only)
```

Browse them under `/playbooks/commands` in the Runner.

### Why both

|  | Skill | Command |
|---|---|---|
| Invoked by | the model, matching your prompt | you, typing `/name` |
| In context | description on **every** turn | nothing until fired |
| Cost at rest | ~570 chars each, forever | zero |
| Arguments | none | `$ARGUMENTS`, `$1`, `$2` |
| Shell output | none | `` !`npm test` `` runs at fire time |
| File refs | none | `@src/foo.ts` inlined |
| Routes to agent/model | no | `agent:`, `model:` |
| Runs off-context | no | `subtask: true` |
| Portable | 6 paths, 3 agent families | **OpenCode only** |

The twelve skills here cost about 5,700 characters of permanently-resident
context, and that grows with every skill added. A command catalogue is free by
comparison — which is why commands can be plentiful and skills should not be.

The other half of it is **long sessions**. A skill body is injected when the
skill fires and then ages out, or gets compacted away entirely. A command
re-injects exact text at the turn you type it, at turn 40, after compaction.
See the Reliability section of `skills/duck-mode/SKILL.md` for the measured
version of that decay.

### The house rule

A command carries the **happy path**. Its skill carries the **failure modes**.
A command that links a skill ends by deferring to it and never restates its
failure-mode table — two copies drift. This is enforced by a test.

Three legitimate shapes:

1. **Thin trigger over a skill** — `/worktree-up`, `/grill-me`, `/red-team`.
2. **Does something a skill cannot** — `/verify` bakes `npm test` output into
   the prompt; `/handoff` uses `subtask: true` to compile off-context.
3. **No skill behind it** — `/standup`. Small utilities do not earn a permanent
   slot in the agent's retrieval context.

### Format

```markdown
---
description: Shown in the TUI autocomplete
agent: build          # optional: build | plan
model: provider/model # optional
subtask: true         # optional: run in a subagent
---

The template. $ARGUMENTS is substituted, !`cmd` output is injected,
and @path/to/file.ts is inlined — all before the model sees it.
```

Install to `~/.config/opencode/commands/<name>.md` (global) or
`.opencode/commands/<name>.md` (project). Restart OpenCode afterwards.

Worked examples live in a **separate** `command-simulations/` directory rather
than beside the command, which is the one place this diverges from skills. The
reason is mechanical: OpenCode registers every `.md` in `commands/` as an
invocable command, so a sibling `verify.SIMULATION.md` would put a bogus
`/verify.SIMULATION` in your autocomplete. The file format is identical and the
skill parser is reused verbatim.

## Credits

One skill here is adapted from another MIT-licensed project. See
[`CREDITS.md`](CREDITS.md) for which upstream commit it derives from, what was
changed, and the original licence text.

## License

MIT
