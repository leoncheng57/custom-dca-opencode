# Worked examples

Three complete diagrams with the reasoning behind each choice. Read the notes,
not just the art — the notes are where the conventions live.

---

## 1. Change set across several packages

Used when opening a PR or presenting a plan for review. The reviewer's first
question is always "what is new versus what is being touched", and their second
is "where might this break something I own".

```
agent-skills/
├── skills/
│   ├── ascii-diagrams/
│   │   ├── SKILL.md                            NEW   conventions only, no discovery
│   │   └── EXAMPLES.md                         NEW   overflow; body stays < 200 lines
│   ├── background-subagent/SKILL.md            NEW   needs env flag  ← see note below
│   ├── deep-research-subagents/SKILL.md        NEW
│   └── docs-and-diagram-tooling/SKILL.md       NEW   machine inventory, dates fast
├── README.md                                   MOD   +4 table rows  ← owned by another
│                                                     branch this week; do not touch
└── .github/workflows/validate.yml              ---   proposed, not in this PR
```

Notes:

- The status column sits at one offset for the whole tree even though the
  deepest path is much longer than the shallowest. Pick the offset from the
  longest path, not per-subtree.
- `---` is a third status meaning "discussed, deliberately excluded". Naming
  the exclusion in the tree stops a reviewer asking for it.
- Two annotations wrap to a second line. Continuation lines start under the
  comment column, never under the path column, so the two never blur together.
- The `← owned by another branch` note is a *coordination* fact. It is invisible
  in the diff and is exactly the kind of thing a diagram should surface.

---

## 2. Request flow with failure modes marked

Used in design review and in bug reports. The value is not the happy path —
which the reader can infer — it is the three places the path silently fails.

```
 POST /api/conversations                          client, one request
         │
         ├── body.agent_settings ──────► validated field-by-field
         │                                 ← omitted keys become SDK defaults,
         │                                   NOT the persisted profile (SDK 1.40)
         │
         └── body.agent_profile_id ────► settings store read
                     │                     only this path merges the profile
                     ▼
         ┌────────────────────────────────────────┐
         │ conversationAgentSettings()            │   server/openhands/
         │   allow-list: condenser, agent_context │   agentSettings.ts
         └───────────────────┬────────────────────┘
                             │  new global setting?  ← add it here or the whole
                             │                         feature is INERT at runtime
                             ▼
         ┌────────────────────────────────────────┐
         │ agent-server  /conversations           │
         └───────────────────┬────────────────────┘
                             │
                             ▼
                 agent_context.skills            ← re-materialized upstream unless
                                                   you send skills: [] every write
```

Notes:

- The branch at the top answers "which of these two request shapes actually
  works", which is the whole reason the diagram exists. The `←` note explains
  the consequence of the wrong branch rather than just labelling it.
- Boxes carry the file path in a right-hand column inside the box. That gives a
  reader somewhere to go without a separate key.
- The three `←` notes are the deliverable. Each is a silent failure: wrong
  defaults, an inert feature, a one-way toggle. None is visible in the source
  at the point where it bites.
- Version and API facts are cited (`SDK 1.40`) so a future reader knows what to
  re-check when the dependency moves.

---

## 3. Before / after UI pair

Used when proposing a UI change. Showing both states is what makes the delta
reviewable; a single "after" mockup forces the reader to reconstruct the
"before" from memory.

**Before**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▸_ OpenHands  Local    Conversations · Terminal · Agent settings · Tools     │
└──────────────────────────────────────────────────────────────────────────────┘

  Agent settings

  ┌────────────────────────────────────────────────────────────────────────┐
  │  Condenser         [ Summarize at 120k tokens          ▾ ]             │
  │  Security          [ None                              ▾ ]             │
  └────────────────────────────────────────────────────────────────────────┘
```

**After**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▸_ OpenHands  Local    Conversations · Terminal · Agent settings · Tools     │
│                        Reminders ◀NEW                                        │
└──────────────────────────────────────────────────────────────────────────────┘

  Reminders                                                       ( 3 enabled )
  Appended to every user message. Global — applies to all conversations.

  ┌────────────────────────────────────────────────────────────────────────┐
  │ [x]  cite-file-lines                                                   │
  │      Reference code as file_path:line_number so it can be opened.      │
  │────────────────────────────────────────────────────────────────────────│
  │ [x]  verify-before-claiming                                            │
  │      Run the command before reporting that it passes.                  │
  │────────────────────────────────────────────────────────────────────────│
  │ [ ]  no-force-push                       ⚠ declares triggers (ignored) │
  └────────────────────────────────────────────────────────────────────────┘

  ⚠  Reminders are global. There is no per-conversation override — the
     upstream API cannot mutate agent_context on a running conversation.
```

Notes:

- Both mockups use the identical navbar width and the identical card width, so
  the eye lands on the real difference instead of on layout jitter.
- `◀NEW` appears exactly once, on the nav entry. Everything below is a new page
  and does not need per-element markers; over-marking dilutes the signal.
- The subtitle line under the heading states the scope decision ("Global —
  applies to all conversations") in the mockup itself. Scope questions asked in
  review are questions the mockup failed to answer.
- The trailing `⚠` block gives the *reason* for the limitation, not just the
  limitation. Without the reason, a reviewer will ask for the per-conversation
  toggle anyway.
- The `⚠ declares triggers (ignored)` inline caveat is deliberately in the row
  it applies to. Moving it to a footnote would break the association.
