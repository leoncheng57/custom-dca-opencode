import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SimulationPanel from './SimulationPanel'
import type { Simulation } from '../lib/simulation'
import styles from './simulation-panel.module.css'

const SIMULATION: Simulation = {
  title: 'Stress-testing a cache plan',
  trigger: 'grill me',
  caveat: 'Round 1 only; a real session runs three to five rounds.',
  turns: [
    { role: 'user', body: 'Grill me on this caching plan.' },
    { role: 'assistant', body: 'Four questions on the **frontier**.' },
    { role: 'tool', label: 'bash', body: '```\n$ rg -n cache server/\n```' },
    { role: 'note', body: 'The whole frontier goes out in one round.' },
  ],
}

function renderPanel() {
  return render(<SimulationPanel skillName="grill-me" simulation={SIMULATION} />)
}

function allTurns(container: HTMLElement): HTMLLIElement[] {
  return Array.from(container.querySelectorAll(`.${styles.turns} > li`))
}

function advance(milliseconds = 3_000) {
  act(() => vi.advanceTimersByTime(milliseconds))
}

describe('SimulationPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps every turn mounted while initially exposing only frame one', () => {
    const { container } = renderPanel()
    const turns = allTurns(container)

    expect(turns).toHaveLength(4)
    expect(turns[0]).not.toHaveAttribute('hidden')
    expect(turns[0]).toHaveTextContent('Grill me on this caching plan.')
    expect(turns.slice(1).every((turn) => turn.hasAttribute('hidden'))).toBe(true)
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('autoplays one accumulating frame after the default delay', () => {
    const { container } = renderPanel()

    advance()

    const turns = allTurns(container)
    expect(turns[0]).not.toHaveAttribute('hidden')
    expect(turns[1]).not.toHaveAttribute('hidden')
    expect(turns[2]).toHaveAttribute('hidden')
    expect(screen.getByText('frame 2 of 4')).toBeInTheDocument()
    expect(screen.getByText(/next frame in 3s/)).toBeInTheDocument()
  })

  it('pauses without advancing', () => {
    const { container } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    advance(30_000)

    expect(allTurns(container)[1]).toHaveAttribute('hidden')
    expect(screen.getByText('frame 1 of 4')).toBeInTheDocument()
    expect(screen.getByText(/· paused/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play/i })).toBeEnabled()
  })

  it('moves Next and Previous exactly one frame and pauses autoplay', () => {
    const { container } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    let turns = allTurns(container)
    expect(turns[1]).not.toHaveAttribute('hidden')
    expect(turns[2]).toHaveAttribute('hidden')
    expect(screen.getByText('frame 2 of 4')).toBeInTheDocument()
    expect(screen.getByText(/· paused/)).toBeInTheDocument()

    advance(20_000)
    expect(turns[2]).toHaveAttribute('hidden')

    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    turns = allTurns(container)
    expect(turns[0]).not.toHaveAttribute('hidden')
    expect(turns[1]).toHaveAttribute('hidden')
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('resets to frame one and pauses', () => {
    const { container } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))

    expect(allTurns(container)[0]).not.toHaveAttribute('hidden')
    expect(allTurns(container).slice(1).every((turn) => turn.hasAttribute('hidden'))).toBe(true)
    expect(screen.getByText('frame 1 of 4')).toBeInTheDocument()
    expect(screen.getByText(/· paused/)).toBeInTheDocument()
  })

  it('applies a changed speed to the next interval without moving the frame', () => {
    const { container } = renderPanel()

    fireEvent.change(screen.getByRole('combobox', { name: /speed/i }), { target: { value: '2' } })
    expect(screen.getByText('frame 1 of 4')).toBeInTheDocument()
    expect(screen.getByText(/next frame in 2s/)).toBeInTheDocument()

    advance(1_499)
    expect(allTurns(container)[1]).toHaveAttribute('hidden')
    advance(1)
    expect(allTurns(container)[1]).not.toHaveAttribute('hidden')
  })

  it('stops at the final frame without looping and disables forward controls', () => {
    const { container } = renderPanel()

    advance()
    advance()
    advance()

    expect(allTurns(container).every((turn) => !turn.hasAttribute('hidden'))).toBe(true)
    expect(screen.getByText('frame 4 of 4')).toBeInTheDocument()
    expect(screen.getAllByText(/playback complete/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /play/i })).toBeDisabled()

    advance(30_000)
    expect(screen.getByText('frame 4 of 4')).toBeInTheDocument()
    expect(screen.getAllByText(/playback complete/).length).toBeGreaterThan(0)
  })

  it('announces frame changes in a polite live region', () => {
    renderPanel()
    const status = screen.getByText('frame 1 of 4')

    expect(status).toHaveAttribute('aria-live', 'polite')
    advance()
    expect(status).toHaveTextContent('frame 2 of 4')
  })

  it('counts down visually without making every tick a live announcement', () => {
    renderPanel()

    expect(screen.getByText(/next frame in 3s/)).toHaveAttribute('aria-hidden', 'true')
    const progress = screen.getByRole('progressbar', { name: /time until next frame/i })
    expect(progress).toHaveAttribute('max', '3000')
    expect(progress).toHaveAttribute('value', '0')

    advance(1_050)

    expect(screen.getByText(/next frame in 2s/)).toBeInTheDocument()
    expect(Number(progress.getAttribute('value'))).toBeGreaterThanOrEqual(1_000)
    expect(screen.getByText('frame 1 of 4')).toHaveAttribute('aria-live', 'polite')
  })

  it('cleans up the active timer on unmount', () => {
    const { unmount } = renderPanel()
    expect(vi.getTimerCount()).toBe(2)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not autoplay when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } satisfies MediaQueryList))
    const { container } = renderPanel()

    advance(30_000)

    expect(allTurns(container)[1]).toHaveAttribute('hidden')
    expect(screen.getByText('frame 1 of 4')).toBeInTheDocument()
    expect(screen.getAllByText(/Autoplay off \(reduced motion\)/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /play/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(allTurns(container)[1]).not.toHaveAttribute('hidden')
  })

  it('gives user and assistant turns distinct role classes across the whole turn', () => {
    const { container } = renderPanel()
    const turns = allTurns(container)

    expect(turns[0]).toHaveClass(styles.user)
    expect(turns[1]).toHaveClass(styles.assistant)
    expect(styles.user).not.toBe(styles.assistant)
  })

  it('announces speakers as text and shows tool labels', () => {
    const { container } = renderPanel()
    const turns = allTurns(container)

    expect(turns[0]).toHaveTextContent('user')
    expect(turns[1]).toHaveTextContent('assistant')
    expect(turns[2]).toHaveTextContent('tool')
    expect(turns[2]).toHaveTextContent('bash')
  })

  it('marks a revealed note as an aside', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    const note = screen.getByRole('complementary')
    expect(note).toHaveTextContent('The whole frontier goes out in one round.')
    expect(within(screen.getAllByRole('listitem')[1]).queryByRole('complementary')).toBeNull()
  })

  it('renders markdown, the caveat, and the source link', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText('frontier')).toBeInTheDocument()
    expect(screen.getByText(/Caveat:/)).toBeInTheDocument()
    expect(screen.getByText(/a real session runs three to five rounds/)).toBeInTheDocument()
    expect(screen.getByText('skills/grill-me/SIMULATION.md')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute(
      'href',
      expect.stringContaining('skills/grill-me/SIMULATION.md'),
    )
  })
})
