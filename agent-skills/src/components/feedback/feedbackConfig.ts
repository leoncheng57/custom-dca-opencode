// Site-wide Google feedback form (see #152, #198). Originally the "SubWait
// Feedback form"; now shared by every page footer. Fields: Category
// (dropdown, entry.1233029295), Current page (short answer,
// entry.201088765), "Describe your comment" (paragraph, entry.1675638029),
// and Rating (1-5 linear scale, entry.1796631476).
//
// DUPLICATED ACROSS REPOS. The same form is used by the personal site at
// leoncheng57/leoncheng57.github.io:src/components/feedback/feedbackConfig.ts.
// There is no shared package between the two projects, so if the form is ever
// recreated or its entry IDs change, BOTH copies must be updated.
export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSe3vmUWVzBh74mpxOz9TXMkqoyAiTeP2B7h9FIzYx19oAtTUA/viewform'

// Entry ID of the "Current page" question, prefilled with the visitor's path.
export const FEEDBACK_PAGE_URL_ENTRY_ID = 'entry.201088765'

/**
 * Path reported in the form's "Current page" field.
 *
 * This is `window.location.pathname`, not the react-router path, so the value
 * keeps the `/custom-dca-opencode/` project prefix the site is deployed under.
 * Both this repo and leoncheng.dev feed the same form, and the prefix is what
 * tells the two apart during triage.
 *
 * Guarded so the module stays importable without a DOM (the unit tests run in
 * Vitest's `node` environment).
 */
export function currentPagePath(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}

export function buildFeedbackUrl(
  pagePath: string,
  formUrl = FEEDBACK_FORM_URL,
  pageUrlEntryId = FEEDBACK_PAGE_URL_ENTRY_ID
): string | null {
  if (!formUrl) {
    return null
  }

  const url = new URL(formUrl)
  url.searchParams.set('usp', 'pp_url')
  url.searchParams.set(pageUrlEntryId, pagePath)
  return url.toString()
}

export function buildEmbeddedFeedbackUrl(
  pagePath: string,
  formUrl = FEEDBACK_FORM_URL,
  pageUrlEntryId = FEEDBACK_PAGE_URL_ENTRY_ID
): string | null {
  const url = buildFeedbackUrl(pagePath, formUrl, pageUrlEntryId)
  if (!url) {
    return null
  }

  const embedded = new URL(url)
  embedded.searchParams.set('embedded', 'true')
  return embedded.toString()
}
