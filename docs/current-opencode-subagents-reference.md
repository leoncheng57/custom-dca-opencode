# Current OpenCode sub-agents: quick reference

Status: **Current-state reference**

## Core rules

1. OpenCode creates Task children; the BFF does not schedule them.
2. A child is an ordinary session with its own transcript and `parentID`.
3. Child session ID is the durable relationship key; Task-part ID is not.
4. Foreground completion can return directly to the waiting parent.
5. Background Task-part completion means launch returned, not child completion.
6. `/session/status` `busy|retry` is strong liveness; absence is not completion.
7. Classic SSE nudges HTTP refetch and has no replay cursor.
8. The child ledger is derived per request and can honestly return unknown.
9. Typical `explore|general` children cannot use the web composer.
10. Child permission inheritance is unverified; use a fresh Build-only parent for mutation.

## Derived report shape

```ts
interface SubagentReport {
  parentID: string
  tasks: Array<{
    sessionID: string
    parentID: string
    title: string
    agent?: string
    description?: string
    state: "launched" | "running" | "completed" | "failed" | "unknown"
    evidence:
      | "session-status"
      | "child-transcript"
      | "parent-completion"
      | "parent-task-part"
      | "launch-only"
      | "no-terminal-evidence"
    background: boolean
    present: boolean
    createdAt: string
    updatedAt: string
    cost: number
    detail?: string
  }>
  capabilities: { backgroundSubagents: boolean }
  truncated: boolean
}
```

## State decision table

| Evidence | State | Confidence |
|---|---|---|
| Status `busy` or `retry` | running | Strong positive liveness |
| Child final assistant error | failed | Strongest terminal evidence |
| Child final assistant completed | completed | Strongest terminal evidence |
| Recognized parent failure/success hand-back | failed/completed | Heuristic terminal evidence |
| Foreground Task part completed | completed | Supported synchronous contract |
| Parent Task part error | failed | Parent-side terminal evidence |
| Task part pending/running | launched | Launch evidence only |
| Background Task part completed only | unknown | Launch completed, child outcome unknown |
| No terminal signal | unknown | Correct conservative result |

Effective endpoint caveat: recognized hand-backs skip child transcript probes.

## Limits

| Limit | Value |
|---|---:|
| Parent messages inspected | 100 newest |
| Unresolved child transcripts probed | 12 newest |
| Messages per child probe | 5 |
| Child probe concurrency | 4 |
| Panel polling while active work exists | 10 seconds |
| Conversation polling | 3 seconds |
| Hub session list | 100 |
| Hub polling | 10 seconds |
| Recents polling | 60 seconds |
| Capability cache | 30 seconds per directory |
| Project `subagent_depth` | 3 |

## Browser routes

| Route | Purpose |
|---|---|
| `GET /api/sessions/:parent/subagents?directory=` | Derive child ledger |
| `POST /api/sessions/:parent/subagents/:child/abort?directory=` | Abort verified direct child |
| `POST /api/sessions/:parent/background?directory=` | Promote eligible foreground child work |
| `GET /api/sessions?directory=` | Flat hierarchy inputs with `parentID` and child counts |
| `GET /api/sessions/:id/messages?directory=` | Raw transcript page |
| `POST /api/sessions/:id/prompt?directory=` | Activate Plan/Build and submit `prompt_async` |
| `GET /api/events?directory=` | Directory-filtered global SSE fan-out |

## Upstream routes

| Route | Meaning |
|---|---|
| `GET /session/{parent}/children` | Authoritative direct children |
| `GET /session/{id}/message` | Parent/child transcript evidence |
| `GET /session/status` | Process-local running/retry map |
| `POST /session/{id}/prompt_async` | Immediate prompt acceptance; no answer body |
| `POST /session/{child}/abort` | Generic session abort; BFF adds ownership check |
| `POST /experimental/session/{parent}/background` | Parent-scoped foreground promotion |
| `GET /experimental/capabilities` | Fail-closed feature discovery |
| `GET /global/event` | Cross-project SSE envelope; no replay cursor |

## UI surfaces

| Surface | What it communicates |
|---|---|
| Hub tree | Parent/child hierarchy, direct child count, nested disclosures |
| Parent Task card | Raw delegation invocation and child navigation |
| Hand-back separator | Likely machine-authored background outcome |
| Child conversation | Parent breadcrumb, `sub` badge, isolated transcript warning |
| Details/Subagents | Derived state, evidence, cost, Stop, promotion, truncation |
| Notification history | Suppressed child activity audit trail, hidden by default |

## Foreground/background decision

| Question | Foreground | Background |
|---|---:|---:|
| Parent needs answer before continuing | Yes | No |
| Work is self-contained | Either | Prefer |
| Follow-up likely | Prefer | Avoid |
| Parent can continue independently | Optional | Prefer |
| Completion ambiguity acceptable | Usually | Required risk |
| Need direct parent result | Yes | Hand-back not guaranteed |

## Permission reminders

- Plan keeps `task` available; resolved pattern policy controls child type.
- Build restoration does not append unconditional Task allow.
- Last matching permission wins.
- Session permission patches append.
- Legacy prompt `tools` persist and must not be used for mode enforcement.
- Build pill is provenance, not proof of capability.
- Fresh Build-only parent is required for mutating Task children.

## Worktree safety card

```text
Child session directory does not move when external worktree access is granted.

Prompt must contain:
- exact absolute worktree and branch
- edits only inside that path
- absolute read/edit/patch paths
- shell workdir or git -C every time
- explicit file ownership and exclusions
- verification commands and report contract

Preflight must prove:
pwd == git top-level == assigned worktree
```

## Troubleshooting card

| Symptom | Meaning |
|---|---|
| `unknown` | Insufficient terminal evidence |
| Background card `completed` | Launch call returned |
| No Stop | Connected process does not report busy |
| No promotion | Capability/eligible foreground work absent |
| Web composer disabled | Child agent is not established Plan/Build |
| Stale panel | Active-work polling stopped; refresh manually |
| `truncated` | More unresolved children than probe budget |
| Child denied Bash | Permission inheritance/history risk; stop |

## Evidence classification

| Behavior | Classification |
|---|---|
| `prompt_async` 204, global/directory SSE scopes | Live-observed |
| Ledger resolver, caps, ownership, UI | Code-supported and deterministic-tested |
| Mock promotion/abort aftermath | Mock-modelled only |
| Child permission inheritance | Unverified |
| Guaranteed hand-back per background run/version | Unverified |
| Live permission patch append semantics | Requires re-probe |

## Jump points

- `docs/subagents.md`
- `server/opencode/subagents.ts`
- `server/opencode/sessions.ts`
- `server/routes/sessions.ts`
- `client/lib/events.ts`
- `client/lib/subagents.ts`
- `client/lib/useSubagents.ts`
- `client/components/subagent-panel.tsx`
- `tests/subagents.test.ts`
- `tests/e2e/subagents.api.spec.ts`
- `tests/e2e/subagents.ui.spec.ts`
