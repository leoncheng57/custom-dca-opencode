---
name: human-verification-steps
description: Generate a short, executable checklist for a human to verify completed user-visible behaviour across browser UI, CLI/scripts, APIs/backends, deployments, and docs/content. Use when the user asks for "human verification steps", "manual verification steps", "how do I verify this manually", "what should I check in the browser", or "give me QA steps".
metadata:
  tags: "verification, docs"
---

# Human verification steps

Produce the smallest checklist that establishes whether a completed change works
from a user's perspective. Do not review the implementation itself. For
adversarial review of a plan, design, or diff, use `red-team-this`; this skill
validates finished behaviour after the change exists.

## Gate on automation

Run the relevant automated checks **before** asking a human to do anything.
Inspect `package.json`, task files, CI configuration, and changed tests to find
the project's real commands. Prefer the narrowest relevant checks, then run the
repository's required aggregate checks when practical:

```bash
npm run typecheck
npm test -- --run
npm run build
```

Replace those examples with the project's actual commands. Record each exact
command, exit status, and useful result. Never write "tests pass" based on an
old CI run, a baseline supplied in the prompt, or an unexecuted command.

If a required automated check fails, stop. Report the failure and use
**Fixes required** as the disposition. Do not send a human to verify a build
that is already red. If infrastructure prevents a check from running, label it
`UNVERIFIED`; do not quietly treat unavailable as passed.

## Research the changed surfaces

Determine what changed before writing the checklist. Do this work yourself:

```bash
git status --short
git diff --stat
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD
```

Then trace every user-facing entry point affected by the diff:

- Read routes, navigation, commands, help text, API contracts, migrations,
  deployment manifests, feature flags, and changed documentation.
- Read changed and adjacent tests for intended states and known boundaries.
- Find the real start command, base URL, ports, required services, seed data,
  accounts, roles, environment variables, and deployment target.
- Run safe setup and inspection commands when access is available.
- Ask the user only for genuine access, credentials, production-only state, or
  unresolved product intent. Do not ask them to locate routes or commands that
  are present in the repository.

State assumptions explicitly. If the exact URL, account role, test fixture, or
deployment environment cannot be established, mark the affected check
`UNVERIFIED` rather than inventing it.

## Write 5-12 executable steps

Keep the checklist between **5 and 12 steps**. Longer checklists do not get run;
combine equivalent states or remove checks already proven by automation.

Every step must contain all three parts:

1. **Action** — exactly what the human does.
2. **Expected** — the user-visible result that means the behaviour works.
3. **Failure signal** — the observable result that means it does not.

Include all setup needed to reproduce the check: exact URL or command, viewport,
theme, login state and role, test data, feature flag, environment, and expected
output or status code. Prefer this:

```markdown
1. **Keyboard-open the details panel** — At
   `http://localhost:3000/orders/ord_failed`, use a signed-in support account,
   set the viewport to `1280x800` in light theme, press `Tab` until "Details"
   is focused, then press `Enter`.
   - **Expected:** The panel opens, focus moves to its heading, and the failed
     payment reason is readable without a mouse.
   - **Failure signal:** The panel stays closed, focus disappears or remains
     behind it, or the reason is clipped.
```

Reject implementation-detail checks such as "the component has class
`text-orange-500`" or "the handler calls `refreshToken()`". Those belong in
automated tests. Ask whether assistant messages are visibly orange, whether the
session survives refresh, or whether the command returns the documented output.

## Cover the boundaries that matter

Select boundaries supported by the changed surface; do not mechanically include
irrelevant checks. Cover the happy path plus the highest-risk adjacent states.

For browser and UI changes, check as applicable:

- Empty or absent data, loading, failure, retry, and permission-denied states.
- Keyboard-only operation, visible focus, focus movement, and Escape behaviour.
- A narrow mobile viewport and the normal desktop viewport.
- Light and dark themes; reduced motion for animation or transitions.
- Refresh, browser back/forward, and a direct deep link in a new tab.
- First and last items, long text, overflow, and disabled controls.

For CLI or scripts, check clean and invalid input, exit status, stdout versus
stderr, non-interactive use, help text, and first/last or empty results.

For APIs and backends, check the documented success response, malformed input,
missing data, authentication and authorization, idempotency or retry behaviour,
and a downstream failure when safely reproducible.

For deployments, check the intended environment, version or commit, health,
configuration and secrets presence without exposing values, rollback signal,
and one real user path through the deployed service.

For docs and content, follow the instructions from a clean starting point,
verify links and commands, inspect narrow rendering where relevant, and confirm
examples match current product language and output.

## Treat evidence honestly

A screenshot proves appearance at one instant. It does **not** prove that a
timer advances, focus moves, a disclosure persists after refresh, keyboard
navigation works, or a failed request is handled. Require observation over time,
interaction, refresh, or controlled failure for those claims.

Classify every completed check separately:

- `VERIFIED` — the action ran and the expected result was directly observed.
- `FAILED` — a failure signal was observed, with concise reproduction details.
- `UNVERIFIED` — the action did not run or evidence is insufficient; state the
  blocker, such as missing access, unavailable server, or absent test data.

Never convert partial evidence into success. "The page loaded before the server
went down" does not verify error handling. "A screenshot looks correct" does
not verify focus or persistence.

## Report the result

Lead with the automated-check report, then the numbered human checklist. After
execution, summarize the evidence under `VERIFIED`, `FAILED`, and `UNVERIFIED`.
Keep an empty category visible as `None` so the result cannot be misread.

End with exactly one disposition:

- **Ready to ship** — required automation passed and all release-critical human
  checks are `VERIFIED`.
- **Fixes required** — automation failed or any release-critical behaviour is
  `FAILED`.
- **Partially verified** — completed checks passed, but non-critical checks
  remain `UNVERIFIED`.
- **Blocked on human access** — release-critical checks require access, account
  roles, credentials, devices, or environments the agent does not have.

Name the failed or blocked step beside the disposition. Do not end with "and
then it worked" or leave the ship decision implicit.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Human starts testing while CI is red | Automated gate was skipped | Run and report real project commands first; stop on failure |
| Checklist says "check the page" | Changed surfaces were not researched | Read the diff, routes, tests, commands, and deployment config |
| Step can be interpreted several ways | Environment or data is missing | Specify URL/command, viewport, theme, login role, and fixture |
| Check asserts a CSS class or function call | Implementation detail replaced behaviour | Describe what the user sees or can accomplish |
| Happy path passes but release still breaks | Boundaries were omitted | Add the highest-risk empty, error, permission, input, or navigation state |
| Screenshot is accepted as interaction proof | Static evidence was overclaimed | Exercise time, focus, persistence, refresh, and failures directly |
| Unavailable server appears under passed checks | Statuses were collapsed | Separate `VERIFIED`, `FAILED`, and `UNVERIFIED` |
| Nobody executes the checklist | It became a test plan | Keep only 5-12 high-information steps |
| Report ends without a ship decision | Evidence was listed but not resolved | End with one explicit disposition |
| Checklist duplicates adversarial diff review | Wrong skill boundary | Use `red-team-this` for assumptions; verify finished behaviour here |

## Worked example

`SIMULATION.md` shows this skill firing on a mixed browser and CLI change: seven
human steps, one `UNVERIFIED` check, and a `Partially verified` disposition.
