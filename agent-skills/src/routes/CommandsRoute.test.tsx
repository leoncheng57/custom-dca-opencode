import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import CommandsRoute from './CommandsRoute'

describe('CommandsRoute', () => {
  it('identifies the commands section and links back to Agent Skills', () => {
    render(
      <MemoryRouter>
        <CommandsRoute />
      </MemoryRouter>,
    )

    expect(document.title).toBe('Commands - Agent Skills - custom-dca-opencode')
    expect(screen.getByRole('link', { name: 'skill' })).toHaveAttribute('href', '/agent-skills')
  })
})
