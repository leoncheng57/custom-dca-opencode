import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SiteFooter from './SiteFooter'

// This repo's Vitest runs in the `node` environment with no DOM testing
// library (see vitest.config.ts, which explains why). Rendering the footer to
// a static string with react-dom/server exercises the real component and its
// real markup without pulling jsdom + @testing-library into the dependency
// list. The trade-off: interaction — opening the feedback dialog, Escape,
// backdrop clicks — is not covered here and is verified in the browser.
function renderFooter(children?: ReactNode): string {
  return renderToStaticMarkup(createElement(SiteFooter, null, children))
}

describe('SiteFooter', () => {
  it('links home to leoncheng.dev off-site, not to this app’s "/"', () => {
    // The critical adaptation from upstream: on leoncheng.dev the home link is
    // a router <Link to="/">, but here "/" is the agent-skills catalogue, so a
    // relative href would keep the visitor on this site.
    const html = renderFooter()

    expect(html).toContain('href="https://leoncheng.dev"')
    expect(html).not.toContain('href="/"')
  })

  it('offers the shared feedback trigger', () => {
    const html = renderFooter()

    expect(html).toContain('aria-label="Send feedback"')
  })

  it('renders the current copyright year', () => {
    const html = renderFooter()

    expect(html).toContain(`© ${new Date().getFullYear()} Leon Cheng`)
  })

  it('renders an optional page-specific extra row', () => {
    const html = renderFooter(createElement('span', null, 'MIT licensed.'))

    expect(html).toContain('MIT licensed.')
  })

  it('omits the extra row entirely when no children are given', () => {
    // Guards the `children ? ... : null` branch — an empty div would show up
    // as a stray gap above the main row.
    const withRow = renderFooter(createElement('span', null, 'Extra'))
    const withoutRow = renderFooter()

    const countDivs = (html: string) => html.split('<div').length - 1
    expect(countDivs(withRow)).toBe(countDivs(withoutRow) + 1)
  })
})
