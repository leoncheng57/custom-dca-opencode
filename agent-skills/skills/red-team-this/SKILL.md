---
name: red-team-this
description: Argue against a plan, design, or diff the agent just produced, switching sides and grounding every objection in file:line, command output, or a doc URL. Use when the user says "red team this", "argue against it", "attack this plan", "poke holes in this diff", "what would go wrong", "convince me not to", or wants an adversarial review of work the agent itself authored.
metadata:
  tags: "critique"
---

# Red team this

You are no longer the author. **Switch sides explicitly**, out loud, in the first
line of the output:

> Red-teaming the plan above. I am arguing against it.

The failure this skill exists to prevent is the author reviewing their own work
and finding it good. A model asked to "check this plan" defends it, because the
reasoning that produced it is still in context and still feels correct. Naming
the side-switch is what breaks that.

**Do not re-litigate the plan's merits.** Every sentence that begins "to be
fair, the plan does correctly…" is the author leaking back in. The plan's case
has already been made; your job is the case against it. Balance is the user's
job, after they have both sides.

**Prefer running as a sub-agent.** Dispatch the red team into a fresh context
holding only the artifact — the plan text, the diff, the design doc — and not
the reasoning that produced it. An agent that never saw the plan being built has
no sunk cost in it and will find objections the authoring context cannot see. Do
this by default for anything larger than a small diff.

---

## The six objection classes

Work all six. Each is a different failure, and skipping one is how the expensive
one gets missed. Say explicitly when a class yields nothing — "no hidden
coupling found" is a finding.

**1. Wrong problem.**
The plan solves something adjacent to the actual complaint. The user reported
slow page loads; the plan adds a cache to a query that takes 4ms. Check the plan
against the original problem statement, quoted verbatim.

**2. A cheaper alternative exists.**
Same outcome, materially less work or less new surface area. A config change
instead of a new module. An existing library already in `package.json`. Deleting
the feature that made this necessary. Name the alternative concretely and state
what it costs relative to the plan.

**3. Hidden coupling.**
The change reaches further than the plan claims. Other callers of the function
being modified, a shared type, a serialised format someone else deserialises, a
database column another service reads, an event contract. Find these by
grepping, not by reasoning about them.

**4. Operational cost.**
What this costs *after* it ships and forever after: a new deploy dependency, a
new secret to rotate, a background job that can now back up, a new failure mode
with no alert on it, on-call surface. Cost-to-build is visible in the plan;
cost-to-run is where the plan is usually silent.

**5. Reversibility.**
How expensive is undoing this? A pure code change is cheap. A data migration, a
published API, a changed on-disk format, an external integration, anything that
generates rows other systems now depend on — these are one-way doors. Say which
door this is. One-way doors deserve disproportionate objection weight even when
the plan is probably right.

**6. The assumption nobody checked.**
The load-bearing belief the plan rests on that no one verified. "The endpoint
returns sorted results." "This runs single-threaded." "That flag is enabled in
prod." "The table is small." These are the objections that turn out to be
correct most often, because unchecked assumptions are unchecked precisely
because they seemed obvious. Go check one or two of them right now rather than
just naming them.

---

## Evidence is mandatory

**Every objection must cite one of:**

- `path/to/file.ts:412` — a specific line
- command output, pasted, with the command that produced it
- a documentation or spec URL

An objection you cannot ground does not go in the main list. Put it in a
separate, clearly labelled bucket:

```markdown
## Speculative (unverified — no evidence gathered)

- The rate limiter may be shared across tenants. Did not verify; would need
  access to the prod config to confirm.
```

Speculative objections are still worth stating — they are hypotheses the user
may be able to settle in seconds from knowledge you lack. But they must never be
mixed in with grounded ones, because an unsourced objection stated with the same
confidence as a sourced one is how a red team becomes noise and gets ignored
wholesale.

Grounding an objection often means running something. Grep for the other
callers. Curl the endpoint. Read the migration. Do that work; a red team that
only reads the plan is a plausibility check, not a review.

---

## Rank by expected cost

Rate each grounded objection on three axes, then **sort by the product**:

| Axis | Scale | Meaning |
|---|---|---|
| **Likelihood** | 1–5 | How likely is this objection actually right? |
| **Cost if true** | 1–5 | Damage if it is right and ships unaddressed. |
| **Cost to check now** | 1–5, *inverted* | Cheap to check scores high. A 10-second grep is 5; a week of load testing is 1. |

Sorting by likelihood × cost-if-true × cost-to-check-now surfaces the cheap
checks on plausible, expensive problems first — which is the correct order to
spend the user's next ten minutes, and is not the order the objections occurred
to you in.

Present as a table:

| # | Class | Objection | Evidence | L | C | Chk | Score |
|---|---|---|---|---|---|---|---|
| 1 | Assumption | Results assumed sorted; `api.ts:88` does not sort | `api.ts:88` | 4 | 5 | 5 | 100 |
| 2 | Coupling | 3 other callers of `parseRow` | `grep -rn parseRow` (3 hits) | 5 | 3 | 5 | 75 |

---

## Close with a decision

Two things, both required.

**The cheapest experiment that would kill the plan.** One command, one query,
one five-minute spike — the single highest-information action available. Not a
list; the one. If the plan survives it, the plan is materially stronger; if it
does not, you saved the whole build.

> Cheapest kill: `grep -rn "parseRow(" src/ | wc -l` — if this is >1 the
> single-caller assumption in step 3 is false and the plan needs restructuring.
> 10 seconds.

**A verdict**, one of exactly three:

- **proceed** — objections found are low-scoring or already mitigated in the plan.
- **proceed-with-change** — name the specific amendment. This is the most common
  honest verdict.
- **stop** — a one-way door with an unchecked assumption behind it, or the
  cheaper alternative is clearly better.

State the verdict even when it is *proceed*. A red team that never clears
anything is a red team the user learns to discount.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Objections read as hedged suggestions | Never switched sides | State the side-switch in line one |
| "To be fair, the plan does handle…" | Author leaking back in | Delete; the plan's case is already made |
| All six classes produce vague concerns | Read the plan, never ran anything | Grep, curl, read the migration |
| User dismisses the whole review | Speculative mixed with grounded | Separate bucket, clearly labelled |
| Highest-scored objection is unactionable | Ranked by severity alone | Include cost-to-check; cheap checks rank up |
| Review ends with "several concerns" | No verdict | proceed / proceed-with-change / stop |
| Same blind spot as the plan | Ran in the authoring context | Dispatch as a sub-agent with only the artifact |

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
a rate-limiter plan attacked with four grounded objections, one speculative
one kept separate, a ranked table and a `proceed-with-change` verdict.
