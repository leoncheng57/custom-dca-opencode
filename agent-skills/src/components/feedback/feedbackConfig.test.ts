import { afterEach, describe, expect, it } from 'vitest'
import {
  buildEmbeddedFeedbackUrl,
  buildFeedbackUrl,
  currentPagePath,
  FEEDBACK_FORM_URL,
  FEEDBACK_PAGE_URL_ENTRY_ID,
} from './feedbackConfig'

describe('buildFeedbackUrl', () => {
  it('returns null when the form URL is not configured', () => {
    expect(buildFeedbackUrl('/custom-dca-opencode/', '')).toBeNull()
  })

  it('uses the configured shared form and entry ID by default', () => {
    const result = buildFeedbackUrl('/custom-dca-opencode/agent-skills/s/code-flowchart')
    expect(result).not.toBeNull()
    expect(result).toContain(FEEDBACK_FORM_URL)

    const url = new URL(result ?? '')
    expect(url.searchParams.get(FEEDBACK_PAGE_URL_ENTRY_ID)).toBe(
      '/custom-dca-opencode/agent-skills/s/code-flowchart'
    )
  })

  it('prefills the page path in a configured Google Form URL', () => {
    const result = buildFeedbackUrl(
      '/custom-dca-opencode/agent-skills/s/code-flowchart',
      'https://docs.google.com/forms/d/e/example/viewform',
      'entry.123456'
    )
    const url = new URL(result ?? '')

    expect(url.searchParams.get('usp')).toBe('pp_url')
    expect(url.searchParams.get('entry.123456')).toBe(
      '/custom-dca-opencode/agent-skills/s/code-flowchart'
    )
  })
})

describe('buildEmbeddedFeedbackUrl', () => {
  it('returns null when the form URL is not configured', () => {
    expect(buildEmbeddedFeedbackUrl('/custom-dca-opencode/', '')).toBeNull()
  })

  it('adds embedded=true on top of the prefilled form URL', () => {
    const result = buildEmbeddedFeedbackUrl(
      '/custom-dca-opencode/agent-skills/s/code-flowchart',
      'https://docs.google.com/forms/d/e/example/viewform',
      'entry.123456'
    )
    const url = new URL(result ?? '')

    expect(url.searchParams.get('embedded')).toBe('true')
    expect(url.searchParams.get('usp')).toBe('pp_url')
    expect(url.searchParams.get('entry.123456')).toBe(
      '/custom-dca-opencode/agent-skills/s/code-flowchart'
    )
  })
})

describe('currentPagePath', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('falls back to "/" when there is no DOM', () => {
    expect(currentPagePath()).toBe('/')
  })

  it('reports the full pathname, including the project base', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { pathname: '/custom-dca-opencode/agent-skills/s/code-flowchart' } },
      configurable: true,
      writable: true,
    })

    expect(currentPagePath()).toBe('/custom-dca-opencode/agent-skills/s/code-flowchart')
  })
})
