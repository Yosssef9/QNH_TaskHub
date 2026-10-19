// @vitest-environment jsdom
import '@/test/setup'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { TaskAssigneePicker } from './TaskAssigneePicker'

const eligibleUsers = [
  { userId: 573, userCode: '2101', userName: 'Yasser Hamza', email: 'yasser.hamza@qnhospital.com.sa' },
  { userId: 750, userCode: '2174', userName: 'Sami Mubarak', email: 'sami@qnhospital.com.sa' },
]
const { fetchNextPage, infiniteState } = vi.hoisted(() => ({
  fetchNextPage: vi.fn(),
  infiniteState: { hasNextPage: true, fetching: false, error: false },
}))
vi.mock('./use-general-assignment', () => ({
  useInfiniteEligibleTaskUsers: () => ({
    data: { pages: [{ items: eligibleUsers }] }, isPending: false,
    isError: infiniteState.error, isFetching: infiniteState.fetching,
    isFetchingNextPage: infiniteState.fetching, hasNextPage: infiniteState.hasNextPage,
    fetchNextPage,
  }),
  useEligibleTaskUser: (userId: number | null) => ({
    data: eligibleUsers.find((user) => user.userId === userId) ?? null,
  }),
}))
vi.mock('@/features/meetings/action-items/use-meeting-action-items', () => ({
  useMeetingActionItemAssignees: () => ({
    data: [
      ...eligibleUsers.map((user) => ({ ...user, eligible: true })),
      { userId: 999, userCode: '9999', userName: 'Inactive', email: 'inactive@qnhospital.com.sa', eligible: false },
    ],
    isLoading: false, isError: false, isFetching: false,
  }),
}))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  infiniteState.hasNextPage = true
  infiniteState.fetching = false
  infiniteState.error = false
  fetchNextPage.mockReset()
})
afterEach(async () => { await i18n.changeLanguage('ar') })

describe('TaskAssigneePicker identity details and search', () => {
  it('shows name, code, and email and keeps those fields after selection', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const view = render(<TaskAssigneePicker value={null} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Assign to' }))
    const option = screen.getByRole('option', { name: /Yasser Hamza/ })
    expect(within(option).getByText('Code: 2101')).toBeVisible()
    expect(within(option).getByText('yasser.hamza@qnhospital.com.sa')).toBeVisible()
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith(573)
    view.rerender(<TaskAssigneePicker value={573} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Assign to' })).toHaveTextContent('Code: 2101')
    expect(screen.getByRole('button', { name: 'Assign to' })).toHaveTextContent('yasser.hamza@qnhospital.com.sa')
  })
  it('loads subsequent pages on scroll without navigating away', async () => {
    const user = userEvent.setup()
    render(<TaskAssigneePicker value={null} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Assign to' }))
    const list = screen.getByRole('listbox', { name: 'Assign to' })
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 260 },
      scrollTop: { configurable: true, value: 625, writable: true },
    })
    fireEvent.scroll(list)
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('option', { name: /Yasser Hamza/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Next page/i })).not.toBeInTheDocument()
  })
  it('does not fetch more while a page request is in progress', async () => {
    infiniteState.fetching = true
    const user = userEvent.setup()
    render(<TaskAssigneePicker value={null} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Assign to' }))
    const list = screen.getByRole('listbox', { name: 'Assign to' })
    Object.defineProperties(list, { scrollHeight: { value: 400 }, clientHeight: { value: 400 }, scrollTop: { value: 0 } })
    fireEvent.scroll(list)
    expect(fetchNextPage).not.toHaveBeenCalled()
  })
  it('filters meeting attendees by email but never shows ineligible users', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TaskAssigneePicker value={null} onChange={onChange} meetingId={12} allowClear={false} />)
    await user.click(screen.getByRole('button', { name: 'Assign to' }))
    expect(screen.queryByRole('option', { name: /Inactive/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Not assigned/ })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Search by name, user code, or email…' }), 'SAMI@QNHOSPITAL')
    expect(screen.getByRole('option', { name: /Sami Mubarak/ })).toBeVisible()
    expect(screen.queryByRole('option', { name: /Yasser Hamza/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Sami Mubarak/ }))
    expect(onChange).toHaveBeenCalledWith(750)
  })
})
