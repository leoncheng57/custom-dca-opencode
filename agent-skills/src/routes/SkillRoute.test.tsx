import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { skillPath } from '../lib/routes'

/**
 * Every shipped skill now has a worked example, so the "renders nothing"
 * branch can no longer be reached through real data. It is still a branch
 * that has to keep working — a skill may legitimately ship without one — so
 * one synthetic name is layered over the real catalog rather than leaving the
 * case untested or depending on a gap in the catalog to stay open.
 */
const NO_SIMULATION_FIXTURE = 'fixture-without-simulation'

vi.mock('../lib/skillsSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/skillsSource')>()
  const bare = { ...actual.skills[0], name: NO_SIMULATION_FIXTURE, simulation: undefined }

  return {
    ...actual,
    findSkill: (name: string) => (name === NO_SIMULATION_FIXTURE ? bare : actual.findSkill(name)),
  }
})

const { skills } = await import('../lib/skillsSource')

function renderSkill(name: string) {
  return render(
    <MemoryRouter initialEntries={[skillPath(name)]}>
      <Routes>
        <Route path="/agent-skills/s/:name" element={<SkillRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

const { default: SkillRoute } = await import('./SkillRoute')

const WITH_SIMULATION = skills.find((skill) => skill.simulation)!

describe('SkillRoute', () => {
  it('labels the collapsed instructions disclosure with its visible heading', () => {
    renderSkill('grill-me')

    const heading = screen.getByRole('heading', { level: 2, name: 'Full Instructions' })
    const disclosure = heading.closest('details')

    expect(heading).toHaveAttribute('id', 'instructions')
    expect(disclosure).toHaveAttribute('aria-labelledby', 'instructions')
    expect(disclosure).not.toHaveAttribute('open')
  })
})

describe('SkillRoute worked example', () => {
  it('shows an open disclosure for a skill that ships one', () => {
    renderSkill(WITH_SIMULATION.name)

    const heading = screen.getByRole('heading', { level: 2, name: 'Simulation Example' })
    const disclosure = heading.closest('details')

    expect(heading).toHaveAttribute('id', 'simulation')
    expect(disclosure).toHaveAttribute('aria-labelledby', 'simulation')
    expect(disclosure).toHaveAttribute('open')
  })

  it('summarises the scenario so the section is worth opening', () => {
    renderSkill(WITH_SIMULATION.name)

    expect(screen.getByText(WITH_SIMULATION.simulation!.title)).toBeInTheDocument()
  })

  it('renders the transcript itself', () => {
    renderSkill(WITH_SIMULATION.name)

    expect(screen.getByText(`skills/${WITH_SIMULATION.name}/SIMULATION.md`)).toBeInTheDocument()
    expect(screen.getByText(WITH_SIMULATION.simulation!.caveat)).toBeInTheDocument()
  })

  it('renders nothing at all for a skill without one', () => {
    renderSkill(NO_SIMULATION_FIXTURE)

    expect(screen.queryByRole('heading', { level: 2, name: 'Simulation Example' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Full Instructions' })).toBeInTheDocument()
  })

  it('runs cheapest question first: example, then instructions, then install', () => {
    renderSkill(WITH_SIMULATION.name)

    // Only the disclosure headings: a collapsed <details> still renders its
    // contents, so the instruction body's own H2s are in the document too.
    const order = screen
      .getAllByRole('heading', { level: 2 })
      .filter((heading) => heading.closest('summary'))
      .map((heading) => heading.getAttribute('id'))

    expect(order).toEqual(['simulation', 'instructions', 'install'])
  })
})
