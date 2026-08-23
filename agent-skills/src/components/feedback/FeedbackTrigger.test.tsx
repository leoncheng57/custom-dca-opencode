import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import FeedbackTrigger from './FeedbackTrigger'
import { FEEDBACK_PAGE_URL_ENTRY_ID } from './feedbackConfig'

beforeEach(() => {
  window.history.replaceState({}, '', '/custom-dca-opencode/agent-skills/s/code-flowchart')
})

describe('FeedbackTrigger', () => {
  it('opens an accessible dialog, updates aria-expanded, and manages focus', async () => {
    const user = userEvent.setup()
    render(<FeedbackTrigger />)
    const trigger = screen.getByRole('button', { name: 'Send feedback' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)

    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /Found a bug or have an idea?/
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const close = screen.getByRole('button', { name: 'Close feedback' })
    expect(close).toHaveFocus()
    await user.click(close)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<FeedbackTrigger />)
    const trigger = screen.getByRole('button', { name: 'Send feedback' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes on a backdrop click and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<FeedbackTrigger />)
    const trigger = screen.getByRole('button', { name: 'Send feedback' })

    await user.click(trigger)
    fireEvent.mouseDown(screen.getByTestId('feedback-backdrop'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('uses embedded and new-tab form URLs for the current off-site path', async () => {
    const user = userEvent.setup()
    render(<FeedbackTrigger />)

    await user.click(screen.getByRole('button', { name: 'Send feedback' }))

    const frame = screen.getByTitle<HTMLIFrameElement>('Feedback form')
    const embeddedUrl = new URL(frame.src)
    expect(embeddedUrl.searchParams.get('embedded')).toBe('true')
    expect(embeddedUrl.searchParams.get(FEEDBACK_PAGE_URL_ENTRY_ID)).toBe(
      '/custom-dca-opencode/agent-skills/s/code-flowchart'
    )

    const link = screen.getByRole<HTMLAnchorElement>('link', {
      name: /Open feedback form in a new tab/,
    })
    const newTabUrl = new URL(link.href)
    expect(link).toHaveAttribute('target', '_blank')
    expect(newTabUrl.searchParams.has('embedded')).toBe(false)
    expect(newTabUrl.searchParams.get(FEEDBACK_PAGE_URL_ENTRY_ID)).toBe(
      '/custom-dca-opencode/agent-skills/s/code-flowchart'
    )
  })
})
