// @vitest-environment jsdom
import '@/test/setup'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiscussionShortcut } from './DiscussionShortcut'

describe('DiscussionShortcut', () => {
  it('does not expose the discussion entry for an unauthorized or solo task', () => {
    const open = vi.fn()
    render(<DiscussionShortcut available={false} onOpen={open} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps a subtle shortcut for a discussion with no unread messages', () => {
    const open = vi.fn()
    render(<DiscussionShortcut available unread={0} onOpen={open} />)
    const button = screen.getByRole('button')
    expect(button).toBeVisible()
    expect(button.querySelector('span')).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(open).toHaveBeenCalledOnce()
  })

  it('shows the unread count and caps very large counts', () => {
    const { rerender } = render(<DiscussionShortcut available unread={5} onOpen={() => {}} />)
    expect(screen.getByText('5')).toBeVisible()
    rerender(<DiscussionShortcut available unread={105} onOpen={() => {}} />)
    expect(screen.getByText('99+')).toBeVisible()
  })
})
