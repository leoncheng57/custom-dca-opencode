---
description: Run the checks, then write human verification steps
agent: build
---

Typecheck:

!`npm run typecheck 2>&1 | tail -20`

Tests:

!`npm test 2>&1 | tail -30`

Build:

!`npm run build 2>&1 | tail -15`

Working tree:

!`git status --short && git diff --stat HEAD`

The above already ran. Do not run them again.

If anything above is red, stop and report the failure. Do not send a human to
verify a build that is already broken.

If everything is green, write the human verification checklist for the change
shown in the diff, scoped to `$ARGUMENTS` when it names a surface:

- 5 to 12 numbered steps, each with the action, the expected result, and the
  failure signal.
- Name the exact URL, command, viewport, theme, or test data each step needs.
- Check what automated tests cannot: visual layout, interaction, keyboard
  access, responsive behaviour, deployed behaviour.
- Cover a boundary, not only the happy path — empty state, error state, narrow
  viewport, or reduced motion, whichever the diff actually touches.
- Separate VERIFIED, FAILED, and UNVERIFIED. Never report an unreachable
  surface as passing.
- End with a disposition: Ready to ship, Fixes required, Partially verified, or
  Blocked on human access.

Research the changed routes, help text, API contracts, tests, start commands,
ports, fixtures, roles, flags, and deployment target yourself. Ask the user only
for access or product intent that the repository cannot establish. Do not use
implementation-detail checks; verify what a user can see or accomplish.

A screenshot proves one visual instant, not focus movement, persistence, time,
keyboard operation, or error handling. Exercise those behaviors directly.

After execution, list `VERIFIED`, `FAILED`, and `UNVERIFIED` separately, keeping
empty categories visible. End with exactly one disposition: **Ready to ship**,
**Fixes required**, **Partially verified**, or **Blocked on human access**.

| Failure | Response |
|---|---|
| Project commands differ from those above | Stop and report the shell-injection limitation; use the repository's real checks in a revised command |
| Automation is red | Stop with Fixes required |
| Infrastructure prevents a check | Mark it UNVERIFIED, never passed |
| A step lacks URL, data, viewport, role, or expected output | Add the missing setup before handing it to a human |
| Checklist exceeds 12 steps | Remove automated or low-information duplication |
