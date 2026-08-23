import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import CommandRoute from './CommandRoute'
import { commands } from '../lib/commandsSource'
import { commandPath, skillPath } from '../lib/routes'

function renderCommand(name: string) {
  return render(
    <MemoryRouter initialEntries={[commandPath(name)]}>
      <Routes>
        <Route path="/agent-skills/c/:name" element={<CommandRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

const LINKED = commands.find((command) => command.relatedSkills.length === 1)!
const STANDALONE = commands.find((command) => command.relatedSkills.length === 0)!
const SUBTASK = commands.find((command) => command.subtask)!

describe('CommandRoute', () => {
  it('leads with the literal invocation, not a prose title', () => {
    renderCommand(LINKED.name)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      new RegExp(`^/${LINKED.name}\\b`),
    )
  })

  it('opens the worked example and leaves the rest collapsed', () => {
    renderCommand(LINKED.name)

    const order = screen
      .getAllByRole('heading', { level: 2 })
      .filter((heading) => heading.closest('summary'))
      .map((heading) => heading.getAttribute('id'))

    expect(order).toEqual(['simulation', 'template', 'install'])

    const isOpen = (id: string) =>
      document.getElementById(id)?.closest('details')?.hasAttribute('open') ?? null

    expect(isOpen('simulation')).toBe(true)
    expect(isOpen('template')).toBe(false)
    expect(isOpen('install')).toBe(false)
  })

  it('renders the transcript from command-simulations, not skills', () => {
    renderCommand(LINKED.name)

    expect(screen.getByText(`command-simulations/${LINKED.name}.md`)).toBeInTheDocument()
  })

  it('states the relationship to a skill when there is one', () => {
    renderCommand(LINKED.name)

    expect(screen.getByRole('link', { name: LINKED.relatedSkills[0] })).toHaveAttribute(
      'href',
      skillPath(LINKED.relatedSkills[0]),
    )
  })

  it('says so explicitly when a command is standalone', () => {
    renderCommand(STANDALONE.name)

    // getAllByText: /standup's own template also says this about itself.
    expect(screen.getAllByText(/no skill behind it/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/^Standalone:/)).toBeInTheDocument()
  })

  it('surfaces subtask as a header fact, because it decides where context goes', () => {
    renderCommand(SUBTASK.name)

    expect(screen.getByText('subagent (subtask)')).toBeInTheDocument()
  })

  it('offers only file-copy install methods', () => {
    renderCommand(LINKED.name)

    // A command is one file; degit and sparse checkout would clone a tree to
    // place it. Their absence is deliberate.
    expect(screen.queryByText(/degit/)).toBeNull()
  })

  it('handles an unknown command without throwing', () => {
    renderCommand('nope-not-real')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No command called')
  })
})
