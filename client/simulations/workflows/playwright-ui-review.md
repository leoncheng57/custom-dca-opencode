---
title: A focused pass finds one real regression and one false alarm
trigger: playwright-ui-review
caveat: >-
  Server startup and browser boot are abbreviated. The screenshot paths are
  illustrative; a real run writes them under the repository's ignored output
  directory.
---

# Worked example

## user

**Workflow — Review a UI change with Playwright**

Route `/playbooks`, dark mode, desktop and mobile. Check the reminder cards
render beside the workflow cards and nothing overflows on a phone.

## assistant

Scope is one route and two viewports, so I am starting the deterministic mock
stack rather than a full deployment. That is the smaller thing that answers the
question.

## tool — bash

```
$ PORT=3531 MOCK_OPENCODE_PORT=4732 npm run dev:mock &
  ready on http://127.0.0.1:3531
```

## tool — playwright

```
await page.goto("http://127.0.0.1:3531/playbooks");
await expect(page.getByTestId("opencode-playbook-workflow-card")).toHaveCount(14);
await expect(page.getByTestId("opencode-playbook-reminder-card")).toHaveCount(12);
  ✓ both catalogues render

await page.setViewportSize({ width: 390, height: 740 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
  → 411   ✗ expected <= 390
```

## assistant

One real finding. At 390px the page scrolls horizontally by 21px. I narrowed it
to the card tag row rather than the grid itself: long tags do not wrap.

## tool — playwright

```
await page.getByTestId("opencode-playbook-reminder-tags").first().evaluate(
  (n) => getComputedStyle(n).flexWrap);
  → "wrap"

await page.getByTestId("opencode-playbook-reminder-card").first().evaluate(
  (n) => n.getBoundingClientRect().width);
  → 411
```

## note

The wrap rule is present, so the tag row is not the cause. The card itself is
wider than the viewport. I withdrew the first diagnosis rather than reporting it
and moving on.

## assistant

Corrected: the grid's `minmax(0, 1fr)` is applied to the outer container but the
card sets a `min-width` that survives it. Evidence written to
`screenshot-output/playbooks-390.png` and `playbooks-1280.png`.

Verified: 14 workflow cards, 12 reminder cards, no dark-mode contrast failures.
Failed: horizontal overflow of 21px at 390px, caused by the card min-width, not
the tag row. I did not regenerate the full screenshot set — only the two views
this scope named.
