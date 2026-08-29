# Diagram command examples

These longer examples supplement `/diagram` without making them permanent
agent context. They demonstrate the three supported forms and the annotations
that carry information beyond structure.

## Change set

```
agent-skills/
├── commands/diagram.md                         MOD   complete invocation procedure
├── command-docs/diagram-examples.md            NEW   examples; never registered
├── command-simulations/diagram.md              MOD   short worked transcript
└── skills/                                     DEL   repository retrieval context removed
```

Use one status-column offset for the whole tree. A continuation aligns under
the comment column. Coordination facts such as "owned by another branch" belong
on the affected path because the filesystem cannot show them.

## Request flow

```
 reminder picker
       │
       ├── reminder id ─────► explicit reminder-command map
       │                              │
       │                              └── missing entry  <- build failure
       ▼
 /playbooks/commands/:name
       │
       └── command glob ─────► detail page
                                      <- reminder body remains independent
```

The valuable information is at the arrows: the explicit join and the boundary
that prevents command text from becoming reminder prompt content.

## Before and after UI

**Before**

```
┌──────────────────────────────────────────────┐
│ Playbooks                                    │
│ [ All ] [ Skills ] [ Commands ]              │
│ 15 skill cards       17 command cards        │
└──────────────────────────────────────────────┘
```

**After**

```
┌──────────────────────────────────────────────┐
│ Playbooks                                    │
│ 17 commands · 0 at-rest tokens        <- NEW │
│ /verify  /diagram  /worktree-up              │
└──────────────────────────────────────────────┘
```

Keep both frames the same width so the reader sees the product change instead
of layout jitter. Mark the delta once rather than decorating every new row.
