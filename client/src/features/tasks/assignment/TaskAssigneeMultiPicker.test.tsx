// @vitest-environment jsdom
import '@/test/setup'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TaskAssigneeMultiPicker } from './TaskAssigneeMultiPicker'

const people = [
  { userId: 573, userName: 'Yasser Hamza', userCode: '2101', email: 'yasser.hamza@qnhospital.com.sa' },
  { userId: 750, userName: 'Sami Mubarak', userCode: '2174', email: 'sami@qnhospital.com.sa' },
]
const { infiniteState, fetchNextPage } = vi.hoisted(() => ({
  fetchNextPage: vi.fn(),
  infiniteState: { hasNextPage: true, fetching: false, error: false },
}))
vi.mock('./use-general-assignment', () => ({
  useInfiniteEligibleTaskUsers: (search: string) => ({
    data: { pages: [{ items: search ? people.filter(p => p.userName.toLowerCase().includes(search.toLowerCase())) : people }] },
    hasNextPage: infiniteState.hasNextPage,
    isPending: false,
    isFetching: infiniteState.fetching,
    isFetchingNextPage: infiniteState.fetching,
    isError: infiniteState.error,
    fetchNextPage,
  }),
}))
vi.mock('@/features/meetings/action-items/use-meeting-action-items', () => ({
  useMeetingActionItemAssignees: () => ({ data: [...people.map(p => ({ ...p, eligible: true })),
    { userId: 999, userName: 'Inactive', userCode: '999', email: 'inactive@qnhospital.com.sa', eligible: false }] }),
}))
beforeEach(async () => {
  await i18n.changeLanguage('en')
  infiniteState.hasNextPage = true
  infiniteState.fetching = false
  infiniteState.error = false
  fetchNextPage.mockReset()
})
afterEach(async () => { await i18n.changeLanguage('ar') })

describe('Collaborative multi-assignee picker', () => {
  it('keeps previous selections while adding another user and retains code and email', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<TaskAssigneeMultiPicker value={[573]} onChange={onChange} knownUsers={people} />)
    await user.click(screen.getByRole('button', { name: /Yasser Hamza/ }))
    const row = screen.getByRole('button', { name: /Sami Mubarak/ })
    expect(within(row).getByText('Code: 2174')).toBeInTheDocument()
    expect(within(row).getByText('sami@qnhospital.com.sa')).toBeInTheDocument()
    await user.click(row)
    expect(onChange).toHaveBeenCalledWith([573, 750])
  })
  it('loads more users on scroll without closing and has no pagination footer', async () => {
    const user = userEvent.setup()
    render(<TaskAssigneeMultiPicker value={[]} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Select users/ }))
    const list = screen.getByLabelText('Select users')
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 260 },
      scrollTop: { configurable: true, value: 625, writable: true },
    })
    fireEvent.scroll(list)
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Sami Mubarak/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Next page/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible()
  })
  it('does not refetch at the end of the list', async () => {
    infiniteState.hasNextPage = false
    const user = userEvent.setup()
    render(<TaskAssigneeMultiPicker value={[]} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Select users/ }))
    const list = screen.getByLabelText('Select users')
    Object.defineProperties(list, { scrollHeight: { value: 400 }, clientHeight: { value: 400 }, scrollTop: { value: 0 } })
    fireEvent.scroll(list)
    expect(fetchNextPage).not.toHaveBeenCalled()
  })
  it('excludes ineligible meeting attendees', async () => {
    const user = userEvent.setup()
    render(<TaskAssigneeMultiPicker meetingId={12} value={[]} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Select users/ }))
    expect(screen.queryByRole('button', { name: /Inactive/ })).not.toBeInTheDocument()
  })
})
