---
title: A frontier of three, then silence
trigger: /grill-me
caveat: >-
  Round 1 of four or five. The command routes to the plan agent, so nothing in
  this transcript could have edited a file.
---

# Worked example

## user

/grill-me the command catalogue design

## assistant

Three questions on the frontier. Q4 (install instructions) depends on Q2, so it
waits for round 2.

Q1 - **Do commands get their own route, or share the skills grid?** A shared
grid keeps one search box, but commands and skills answer different questions
and mixing them buries the smaller set.

-> Separate route. The two have different install paths and different
portability guarantees, and a visitor looking for one is not browsing the other.

Q2 - **Where do command worked-examples live?** Beside the command is the
obvious answer, but `commands/` is a namespace: OpenCode registers every `.md`
in it, so a sibling file becomes a bogus slash command.

-> Separate `command-simulations/` directory. It breaks symmetry with skills,
which is a real cost, but the alternative pollutes the user's autocomplete.

Q3 - **Ship Claude Code variants?** Claude Code reads `.claude/commands/` with
a different frontmatter dialect.

-> OpenCode only, stated plainly. The catalogue's value is portability, and
pretending commands are portable when the dialects differ is the misleading
move.

## note

The whole frontier goes out in one round, numbered, each with a recommendation.
Q4 is named and deferred rather than asked, because asking a question whose
prerequisite is still open forces a hypothetical answer that settles nothing.

`agent: plan` in the frontmatter is what makes this safe to fire mid-session:
the plan agent has edit and bash set to ask, so a grilling cannot quietly start
implementing its own recommendations.

The turn ends here, waiting. That is the skill's actual behaviour, and a
transcript that answered its own questions would misrepresent it.
