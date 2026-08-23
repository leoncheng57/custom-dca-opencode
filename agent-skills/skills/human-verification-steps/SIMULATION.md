---
title: Verifying a notification settings UI and export-status CLI
trigger: give me QA steps
caveat: >-
  This compact example uses an illustrative application and shows one execution
  report rather than every boundary the repository could support. A real run
  derives commands, URLs, roles, fixtures, and release-criticality from the
  current diff and environment instead of copying these values.
---

# Worked example

## user

The notification preferences change is finished. It adds a browser screen and
an `export-status` CLI command. Please give me QA steps before release.

## assistant

I’ll run the repository’s automated gate before assigning manual work. If it is
red, I’ll stop rather than ask you to test a broken build.

## tool — bash

```
$ npm run typecheck
> tsc --noEmit

$ npm test -- --run
> vitest --run
Test Files  passed
Tests       passed

$ npm run build
> vite build
✓ built
```

## assistant

Automation is green. I’m tracing the changed routes, commands, fixtures, and
deployment requirements now so the checklist uses the real entry points.

## tool — bash

```
$ git diff --name-only origin/main...HEAD
package.json
src/cli/export-status.ts
src/routes/settings/notifications.tsx
src/routes/settings/notifications.test.tsx
tests/cli/export-status.test.ts

$ rg -n "notifications|export-status|notification-empty" package.json src tests
package.json:14:    "export-status": "tsx src/cli/export-status.ts"
src/routes/settings/notifications.tsx:18:export const path = "/settings/notifications"
src/routes/settings/notifications.test.tsx:41:fixture: "notification-empty"
tests/cli/export-status.test.ts:27:expect(result.exitCode).toBe(2)
```

## assistant

**Automated checks**

| Command | Result |
|---|---|
| `npm run typecheck` | `VERIFIED` — exited successfully |
| `npm test -- --run` | `VERIFIED` — test files and tests passed |
| `npm run build` | `VERIFIED` — production build completed |

Use local data fixture `notification-empty`. Start the app with `npm run dev`
and keep the CLI in a second terminal.

1. **Open the happy path** — As signed-in user `qa-member@example.test`, visit
   `http://localhost:3000/settings/notifications` at `1280x800` in light theme.
   - **Expected:** Email and push preferences load with labels and current values.
   - **Failure signal:** The route is blank, errors, or shows another user’s values.
2. **Save and refresh** — Disable push, save, then refresh the exact URL.
   - **Expected:** Success feedback appears and push remains disabled after refresh.
   - **Failure signal:** No feedback, duplicate requests, or the old value returns.
3. **Check keyboard operation** — Reload, use only `Tab`, `Space`, and `Enter` to
   change and save a preference.
   - **Expected:** Focus is always visible, follows visual order, and reaches Save.
   - **Failure signal:** Focus disappears, traps, skips a control, or saving needs a mouse.
4. **Check narrow dark mode** — At `390x844` in dark theme, open the same deep
   link with the `notification-empty` fixture.
   - **Expected:** The empty state is readable with no horizontal scrolling.
   - **Failure signal:** Text or controls clip, overlap, or lose contrast.
5. **Check permission denial** — Sign in as `qa-readonly@example.test` and open
   the same URL directly in a new tab.
   - **Expected:** A permission message appears without exposing preference data.
   - **Failure signal:** Preferences render, the page loops, or a raw error appears.
6. **Run the CLI success path** — Execute
   `npm run export-status -- --user qa-member@example.test`.
   - **Expected:** One documented status prints to stdout and the exit status is `0`.
   - **Failure signal:** Output is ambiguous, written only to stderr, or exits non-zero.
7. **Run invalid CLI input in staging** — With staging credentials, execute
   `npm run export-status -- --user missing@example.test`.
   - **Expected:** A concise not-found message goes to stderr and exit status is `2`.
   - **Failure signal:** It exits `0`, prints a stack trace, or returns another user.

A screenshot can support steps 1 and 4 only. It cannot prove save persistence,
focus movement, permission handling, or either CLI exit status.

## user

Steps 1-6 matched. I could not run step 7 because I do not have staging
credentials. On step 3, focus was visible and Save worked with Enter.

## assistant

**VERIFIED**

- Steps 1-6. Step 2 included refresh persistence; step 3 included keyboard focus
  and activation, not screenshot-only evidence.

**FAILED**

- None.

**UNVERIFIED**

- Step 7: staging credentials were unavailable, so invalid CLI input and exit
  status `2` were not observed.

**Disposition: Partially verified.** The completed browser checks and local CLI
success path passed, but staging invalid-input handling remains unverified.

## note

The example stops at the evidence boundary rather than converting missing
staging access into success. Because step 7 is not identified as
release-critical in this illustrative scenario, the disposition is `Partially
verified`; if the repository marked it release-critical, the correct disposition
would be `Blocked on human access`.
