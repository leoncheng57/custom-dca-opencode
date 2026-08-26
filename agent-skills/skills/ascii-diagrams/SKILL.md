---
name: ascii-diagrams
description: Draw annotated ASCII diagrams instead of prose walls when explaining a multi-step plan, a large change set, a data flow, a UI proposal, or the state of a long session. Covers three diagram types (annotated file tree with NEW/MOD status column, vertical data flow with failure-mode annotations, box-drawing UI mockup), the box-drawing character set, alignment and width discipline, and the rule that every annotation must add information the structure cannot show. Use when asked to "show me the plan", "what files change", "diagram this", "sketch the UI", "draw the flow", "summarize where we are", or when about to write more than a few paragraphs describing a change set or architecture.
metadata:
  tags: "diagrams, docs, output-style"
---

# ASCII diagrams that are worth reading

A diagram earns its place only if it says something prose cannot say cheaply.
The three formats below carry information that a paragraph loses: **spatial
grouping**, **status per item**, and **where the trap is**.

Reach for one of these instead of a prose wall when the answer has structure.

---

## Pick the type

| Situation | Type | Why |
|---|---|---|
| "What files will this touch?" / plan review / PR summary | **Annotated file tree** | New-vs-modified is a column, not a sentence |
| "How does X get to Y?" / design review / where a bug hides | **Data flow** | Branch points and failure modes have positions |
| "What will the screen look like?" / proposing UI | **UI mockup** | Layout and changed elements are visual facts |
| Tracing an *existing* execution path through real code | see `code-flowchart` skill | That one does the discovery too |
| Two axes of comparison, no topology | **Table** | Do not draw a diagram for tabular data |
| One linear sequence, no branches | **Numbered list** | Do not draw a diagram for a list |

Rendering medium (ASCII vs Mermaid vs SVG) and the tooling that produces them
is a separate decision — see the `docs-and-diagram-tooling` skill.

---

## Hard rules

1. **Always fence the diagram** in a ``` block. Unfenced, a proportional font
   destroys every column you aligned.
2. **Width ≤ 100 columns.** Terminals, PR description panes, and side-by-side
   diff views all clip past that. 80 is safer still. Count before shipping.
3. **Annotations must add information not visible from the structure.**
   `reminders.ts   NEW   new file` is noise. `reminders.ts   NEW   pure: parse /
   render / validate` is a design decision.
4. **Call out traps inline with `←`.** This is what makes a diagram worth
   reading rather than skimming. If a step silently no-ops, if a list gets
   replaced rather than merged, if an allow-list must be extended or the feature
   is inert — that annotation goes *at the arrow where it bites*, not in a
   paragraph underneath.
5. **Columns line up.** Status columns share one start offset across the whole
   tree. Arrows land on the glyph they point at. Box sides are vertically
   flush. Misalignment reads as carelessness and destroys trust in the content.
6. **Realistic copy, never lorem.** `( 3 enabled )` and
   `Reference code as file_path:line_number` communicate; `Label text here`
   does not.

## Character set

Keep it small. Mixing weights looks accidental.

```
box       ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ─ │       default for everything
flow      ▼ ▲ ► ◄ →                    direction of travel
pointer   ←                            "the note applies to THIS line"
marker    ◀NEW  ⚠  ✓  ✗                changed / warning / pass / fail
checkbox  [x]  [ ]                     UI state
tree      ├── └── │                    file trees only
```

Double-line `╔ ╗ ╚ ╝ ║` reads as "external system / not ours". Use it sparingly
or not at all. Never mix `─` and `-` in the same rule.

**Ambiguous-width hazard.** `⚠ ◀ ▸ ▾ ►` are East-Asian-Width *ambiguous*: one
character, but some terminals with emoji presentation draw them two cells wide.
Box-drawing characters are never ambiguous, so a single `⚠` inside a box shifts
that one row by a cell and nothing else — the classic off-by-one you see in
mockups. **Align by character count**, which is what GitHub, VS Code and the
check below all use. If your audience is a terminal known to double-width them,
drop to `!` and `<--` instead of chasing both conventions at once.

---

## Type (a) — annotated file tree

For change sets. Three columns: path, status, why.

```
custom-dca-ide-with-openhands/
├── reminders/                                  NEW   catalogue, SKILL.md format
│   ├── cite-file-lines/SKILL.md                NEW
│   └── verify-before-claiming/SKILL.md         NEW
├── server/openhands/
│   ├── reminders.ts                            NEW   pure: parse / render / validate
│   ├── remindersLoader.ts                      NEW   the ONLY fs read (boot-time)
│   └── agentSettings.ts                        MOD   + user_message_suffix in allow-list
├── client/
│   ├── pages/Reminders.tsx                     NEW   own nav entry
│   └── lib/events.ts                           MOD   + extended_content
└── Dockerfile                                  MOD   COPY reminders  ← release-build trap
```

- Status column starts at one fixed offset for the *entire* tree, chosen so the
  longest path clears it by at least two spaces.
- `NEW` / `MOD` / `DEL` only. Leave the comment blank when there is nothing
  non-obvious to say — an empty cell is better than filler.
- Directories that only contain listed children need no status.
- The `←` trap goes on the line that will bite, here the release-only Docker
  build that dev never exercises.

## Type (b) — data flow

Vertical, top to bottom. Boxes only for things that are *components*; bare
labels for data and calls. Branches hang off `├──`, the trunk continues on `│`.

```
 reminders/<id>/SKILL.md            parsed once at boot
         │
         ├── enabled ids ─────► misc_settings.helix_hub.reminder_presets
         │                              SOURCE OF TRUTH for the checkboxes
         │
         └── renderReminders(ids) ─► agent_context.user_message_suffix   (derived)
                     │
                     ▼
         PATCH /api/settings   ← one call, both halves
                     │                                        ▲
                     │                    must send skills:[] ┘ or upstream
                     ▼                    re-materializes them (#89 one-way bug)
         ┌──────────────────────────────────┐
         │ agent-server DEFAULT PROFILE     │
         └────────────────┬─────────────────┘
                          │  conversationAgentSettings() forwards it
                          │  ← PR #103 allow-list, +1 key or this is INERT
                          ▼
         POST /api/conversations
```

What makes this version useful rather than decorative:

- It names the **source of truth** and marks the other value `(derived)`. That
  is the single most common design question and it is answered spatially.
- Two of the four annotations are **failure modes**, each anchored with `←` to
  the exact hop where the failure occurs. The `▲ ┘` elbow lets a note attach to
  an arrow that has no room beside it.
- It cites the issue/PR numbers that establish the trap. A reader who doubts
  the claim can go check.

Do not draw only the happy path. If a flow has no failure modes worth marking,
it probably did not need a diagram.

## Type (c) — UI mockup

Chrome in box-drawing, real strings inside, `◀NEW` on anything the change adds.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▸_ OpenHands  Local  Conversations · Manager runs · Terminal · Notifications │
│                      Agent settings · Tools · Reminders ◀NEW · Contributing  │
└──────────────────────────────────────────────────────────────────────────────┘

  Reminders                                                       ( 3 enabled )

  ┌────────────────────────────────────────────────────────────────────────┐
  │ [x]  cite-file-lines                                                   │
  │      Reference code as file_path:line_number so it can be opened.      │
  │────────────────────────────────────────────────────────────────────────│
  │ [ ]  no-force-push                       ⚠ declares triggers (ignored) │
  └────────────────────────────────────────────────────────────────────────┘
```

- `◀NEW` marks the delta. A reviewer should be able to find every change in the
  mockup without reading the prose.
- `⚠` carries a caveat about *behaviour*, not appearance — here, that a field
  the user can see is silently not honoured.
- Row separators use `│───…───│`, keeping the outer walls intact.
- Show real counts and real copy. `( 3 enabled )` tells the reviewer the header
  is dynamic; `(N enabled)` does not.

---

## Before you ship it

Count **characters**, not bytes — every box-drawing glyph is 3 bytes in UTF-8,
so `awk '{print length}'` and `wc -c` will both lie to you by a factor of three:

```bash
# widest line in characters, and any box rows whose length disagrees
python3 - diagram.txt <<'EOF'
import sys
L = open(sys.argv[1]).read().split("\n")
print("widest:", max(len(l) for l in L))
rows = [(i+1, len(l)) for i, l in enumerate(L) if l.lstrip()[:1] in "┌│└"]
for n, w in rows:
    if w != max(w for _, w in rows): print(f"  line {n}: {w} chars (short)")
EOF
```

Then read it back in a monospace context. Check: status column single offset,
every `│` in a box column-aligned, every `▼`/`►` landing on its target, no line
over 100. Fix drift before posting — a misaligned diagram is worse than prose.

## When not to diagram

Skip it for a single-file change, a yes/no answer, a linear sequence with no
branches, or anything already fully expressed by a table. A diagram nobody
needed costs the reader time and costs you credibility on the next one.

## Longer worked examples

`EXAMPLES.md` in this directory has three complete diagrams — a multi-package
change set, a request flow with three annotated failure modes, and a
before/after UI pair — with notes on the specific choices made in each.

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
a change set turned into an annotated tree with two failure modes marked, then
width-checked before shipping.
