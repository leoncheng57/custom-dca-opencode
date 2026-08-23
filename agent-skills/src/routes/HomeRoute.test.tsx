import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import HomeRoute from './HomeRoute'

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeRoute />
    </MemoryRouter>,
  )
}

describe('HomeRoute', () => {
  it('briefly explains the project without claiming to host the Runner', () => {
    renderHome()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('browser cockpit')
    expect(screen.getByText(/does not host an OpenCode server/i)).toBeInTheDocument()
  })

  it('makes Agent Skills the one live section', () => {
    renderHome()

    expect(screen.getByTestId('website-card-agent-skills')).toHaveAttribute('href', '/agent-skills')
    expect(screen.getByText('1 section live')).toBeInTheDocument()
  })

  it('links all five work-in-progress sections to real routes', () => {
    renderHome()

    for (const route of ['features', 'docs', 'architecture', 'roadmap', 'changelog']) {
      expect(screen.getByTestId(`website-card-${route}`)).toHaveAttribute('href', `/${route}`)
    }
    expect(screen.getAllByText('work in progress')).toHaveLength(5)
  })
})
