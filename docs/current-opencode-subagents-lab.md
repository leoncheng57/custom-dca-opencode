# Current OpenCode sub-agents: safe learning lab

Status: **Mock/static learning exercises**

These exercises build intuition without contacting a production OpenCode server, starting the normal
development stack, invoking a model, or creating a real worktree.

## Safety boundary

- Use repository source, Vitest, and Playwright's deterministic `/tmp` mock stack only.
- Do not run `npm run dev`, live BFF routes, direct `prompt_async`, or production supervisor commands.
- Do not create/delete real sessions or worktrees.
- Playwright starts its own deterministic mock OpenCode and preview processes.

## Lab 1: classify evidence by hand

Goal: distinguish launch, liveness, and terminal evidence.

1. Read the fixture children in `tests/e2e/mock-opencode.ts`.
2. For each child, record child presence, Task status, background flag, status-map entry, final
   assistant state, parent hand-back, expected ledger state, and evidence label.
3. Apply this order:

   ```text
   busy/retry
   child final turn
   parent hand-back
   foreground Task completion/error
   launch-only
   unknown
   ```

4. Run:

   ```bash
   npm test -- tests/subagents.test.ts
   ```

5. Explain why a background Task part marked completed can still yield unknown.

## Lab 2: trace one ledger request

Goal: understand the BFF as reconciler rather than scheduler.

1. Start at `server/routes/sessions.ts` and find the parent subagent route.
2. Follow into `listSubagents()`.
3. Draw the calls to children, parent messages, status, capabilities, and child transcripts.
4. Identify which failures are swallowed and which fail the whole request.
5. Locate the transcript probe cap and concurrency limit.
6. Predict when `truncated` is true.

Run the API fixture only:

```bash
npm run test:e2e -- tests/e2e/subagents.api.spec.ts
```

## Lab 3: foreground versus background

Goal: separate browser prompt transport from Task execution mode.

Answer before reading tests:

1. Does a browser foreground Task keep the browser HTTP request open?
2. What exactly completes when a background Task tool part becomes completed?
3. Which path returns a direct result to the parent?
4. Which path may create a synthetic user-role hand-back?

Then inspect `docs/subagents.md` and the Task fixture. The key distinction is:

```text
Browser prompt transport: always prompt_async
Task relationship: foreground waits; background launches independently
```

## Lab 4: detect a hand-back

Goal: understand why server and client can disagree.

Classify each message twice, once with server rules and once with client rules:

```text
Background task ses_abc completed successfully.
ses_abc completed.
The task ses_abc failed to complete.
I reviewed ses_abc and it looks complete.
```

Server requires known child ID plus outcome. Client additionally requires a delegation word. Check
your answers with:

```bash
npm test -- tests/subagent-ui.test.ts tests/subagents.test.ts
```

## Lab 5: Plan/Build activation

Goal: see how Plan can delegate without allowing direct mutation.

1. Read the Plan tool allowlist in `server/opencode/sessions.ts`.
2. Predict the appended deny suffix for the fixture catalogue.
3. Explain why `task` receives no blanket Plan denial.
4. Predict Build restoration after prior Plan denies.
5. Confirm no unconditional Task allow is appended.

Run:

```bash
npm test -- tests/session-mode-policy.test.ts
```

## Lab 6: policy concurrency

Goal: identify exactly what the session lock protects.

Read the lock key and critical section in `server/opencode/sessions.ts`, then answer:

- Can opposite-mode prompts in one BFF apply each other's policy?
- Does the lock cover the entire agent turn?
- Does it coordinate the TUI, direct API, or second BFF?

Run the deterministic race:

```bash
npm run test:e2e -- tests/e2e/smoke.api.spec.ts --grep "opposite-mode"
```

## Lab 7: browser journey

Goal: map one delegation across the UI.

Follow:

```text
Hub parent disclosure
  -> parent conversation
  -> Task card
  -> child transcript
  -> parent breadcrumb
  -> Details/Subagents evidence row
  -> Stop eligibility
```

Run:

```bash
npm run test:e2e -- tests/e2e/subagents.ui.spec.ts
```

Repeat at the test's mobile viewport and identify the sheet/focus behavior.

## Lab 8: draft a native worktree assignment

Goal: understand that permission to an external path does not move child scope.

Draft, but do not execute, a Task prompt for fictitious `/tmp/subagent-lab-worktree`. Include:

- fresh Build-only parent requirement;
- exact absolute path and branch;
- edits allowed only inside the path;
- absolute paths for read/edit/patch;
- `workdir` for every shell call;
- file ownership and exclusions;
- the three-command preflight;
- explicit stop-without-mutation behavior;
- verification and report requirements.

Compare with `reminders/native-worktree-subagents/SKILL.md`.

## Lab 9: explain unknown without hand-waving

Goal: practice evidence-based incident communication.

For each scenario, write what is known, unknown, and safe next action:

1. OpenCode restarted during an unfinished child assistant turn.
2. Background Task launch completed with no hand-back.
3. Child is absent from status but has completed assistant turn.
4. Hand-back says success but child transcript was not probed.
5. Probe cap excluded an older unresolved child.

The answer must never treat status absence as terminal evidence.

## Lab 10: confidence pass

```bash
npm run typecheck
npm test
```

These commands do not contact production OpenCode. If you run the optional Playwright labs, ensure
the fixed test ports are free and owned by this worktree's deterministic stack.

## Completion checklist

You understand the current system when you can explain:

- why child session ID is the stable key;
- why foreground/background is separate from `prompt_async`;
- why background completed is not child completed;
- why status absence does not mean idle;
- why unknown is a useful state;
- how the evidence ledger is bounded;
- where parent hand-back is heuristic;
- why child permissions cannot be inferred from parent mode;
- why native worktree children require absolute-path discipline;
- which tests prove application behavior but not live OpenCode internals.
