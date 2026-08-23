import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PlaceholderRoute from './PlaceholderRoute'

describe('PlaceholderRoute', () => {
  it('labels unfinished content and links its tracking issue', () => {
    render(
      <MemoryRouter>
        <PlaceholderRoute
          title="Roadmap"
          description="Roadmap content is queued."
          issue="https://github.com/leoncheng57/custom-dca-opencode/issues/110"
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Roadmap')
    expect(screen.getByText(/part of the public-site scaffold/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /website build-out issue/i })).toHaveAttribute(
      'href',
      'https://github.com/leoncheng57/custom-dca-opencode/issues/110',
    )
    expect(screen.getByTestId('website-placeholder-back')).toHaveAttribute('href', '/')
  })
})
