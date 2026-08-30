---
title: A route change shown as a file tree
trigger: ascii-diagrams
caveat: >-
  One of three supported diagram forms. The width check is summarized rather
  than shown running, and a real change set may require several alignment passes.
---

# Worked example

## user

what files change for adding saved filters

*Reminder attached: Draw an ASCII Diagram*

## assistant

```
app/
├── server/
│   ├── routes/savedFilters.ts              NEW   CRUD boundary, validates owner
│   └── routes/index.ts                     MOD   + mount route
├── client/issues/
│   ├── SavedFilterPicker.tsx               NEW   keyboard-selectable combobox
│   └── FilterBar.tsx                       MOD   source of truth moves upward
├── db/
│   └── 0044_saved_filters.sql              NEW   owner_id index  <- tenancy boundary
└── test/savedFilters.test.ts               NEW   API + cross-user rejection
```

- The status column starts at one offset across the whole tree.
- `FilterBar.tsx` names the state-ownership change rather than saying only
  "modified".
- The migration carries the trap inline: omitting `owner_id` from the index
  turns a per-user feature into a cross-user leak.
- Widest line: 91 characters, under the 100-column limit.

## note

`$ARGUMENTS` supplied both the diagram type and the subject. The command chose
an annotated tree because the question was "what files change"; a data-flow
diagram would add arrows without answering the reviewer's first question.

The one `<-` annotation is the deliverable, not decoration. It marks a failure
the file structure cannot show.
