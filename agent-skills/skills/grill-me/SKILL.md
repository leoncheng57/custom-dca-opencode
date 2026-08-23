---
name: grill-me
description: Interview the user in rounds about a plan, design, or decision, working a design tree until every branch is settled and nothing is left silently assumed. Use when the user says "grill me", "grill-me", "stress-test this plan", "poke holes in my design", "interview me about this", or wants to reach shared understanding on a design before anything gets built.
metadata:
  tags: "critique"
---

# Grill me

<!-- Adapted from mattpocock/skills (MIT): skills/productivity/grilling.
     Restructured for OpenCode: single model-invoked skill (no wrapper split,
     because OpenCode ignores `disable-model-invocation`), plus a closing
     handoff/ADR step that upstream does not have. See CREDITS.md. -->

Interview the user relentlessly until you reach a shared understanding. Map the
problem as a **design tree**: every decision branches into the decisions that
hang off it.

---

## Work the tree in rounds

The **frontier** is every decision whose prerequisites are already settled — the
questions you can ask *now* without guessing at answers you have not heard yet.

**Ask the whole frontier in one round.** Number each question and give your
recommended answer. Then stop and wait for the user's answers before the next
round.

A question whose answer depends on another question still open in this round
belongs to a *later* round, not this one. Putting it in the current round forces
the user to answer hypothetically, and hypothetical answers do not settle
anything.

Each round of answers reshapes the tree: settled decisions push the frontier
outward and unblock the questions that depended on them. Recompute the frontier
and ask the next round.

---

## Round format

```
❓ **Q1** - **<question title>**: <question body, possibly multiple paragraphs,
including the concrete options if there are options>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body>

➡️ <your recommended answer>
```

Always give a recommendation. A question without one offloads the thinking back
onto the user, which is the opposite of the point. Recommend even when you are
unsure, and say that you are unsure.

---

## Finding facts is your job, never the user's

When a frontier question needs a fact from the environment — what a file
contains, which version is installed, whether an endpoint exists, what the
current schema looks like — **dispatch a sub-agent to find it**. Never ask the
user for something you could look up.

**Do not block on the lookup.** A running exploration is an unsettled
prerequisite, so only the questions *downstream* of it wait for the sub-agent to
report. Ask the rest of the frontier now, in the same round.

The split is: **facts are yours, decisions are the user's.** Look up the facts.
Put every decision to the user and wait.

---

## Hold your position

Do not accept an answer you believe is wrong just because the user gave it. Say
so, and argue the case with the reason. A grilling that folds at the first push
back has produced consensus about nothing.

Equally, do not stop at the first plausible-sounding answer to your own
question. The recommendation you offer is a starting position, not a conclusion.

---

## Stop condition

**The session is done when the frontier is empty**: every branch of the design
tree visited, nothing left silently assumed.

Then summarise the agreed decisions back as one list, and **wait for the user to
confirm**. Do not act on the design until they do.

---

## Close it out

Once the user confirms, offer to persist the outcome — the decisions are
worthless if they live only in a scrolled-past chat:

- **A handoff doc** — the decisions restated as directives with their rationale,
  in the shape another agent can execute from. Use the `parallel-research-handoff`
  skill's handoff structure if the work is about to be delegated.
- **An ADR** — context, decision, consequences, one file per decision, committed
  next to the code it governs. Better when the *reasoning* is what needs to
  survive, especially for the decisions that were close calls.

Ask which; write it if they want it.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| User answers "it depends on Q3" | A dependent question was put in the current round | Move it to a later round; the frontier was computed wrong |
| Grill feels like an interrogation drip | Questions asked one at a time | Ask the entire frontier per round |
| User is asked what version of X is installed | A fact was treated as a decision | Dispatch a sub-agent; look it up |
| Whole round stalls on one lookup | Blocked on the sub-agent | Only downstream questions wait; ask the rest now |
| User picks every recommendation without thought | Recommendations offered with no reasoning | Give the why, and name the tradeoff being made |
| Agreement reached, then relitigated during build | Outcome never written down | Emit the handoff doc or ADR |
| Session ends still holding assumptions | Stopped when questions ran out, not when the frontier emptied | Recompute the frontier; unvisited branches remain |

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
round 1 of a grilling on a Redis caching plan, showing a full frontier asked in
one round, a fact looked up rather than asked, and a question deliberately held
back for round 2.
