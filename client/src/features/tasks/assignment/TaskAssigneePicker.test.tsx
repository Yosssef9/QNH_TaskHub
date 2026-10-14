// @vitest-environment jsdom
import '@/test/setup'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'

import { TaskAssigneePicker } from './TaskAssigneePicker'

const eligibleUsers = [
  { userId: 573, userCode: '2101', userName: 'Yasser Hamza', email: 'yasser.hamza@qnhospital.com.sa' },
  { userId: 750, userCode: '2174', userName: 'Sami Mubarak', email: 'sami@qnhospital.com.sa' },
]

vi.mock('./use-general-assignment', () => ({
  useEligibleTaskUsers: () => ({
    data: { items: eligibleUsers }, isLoading: false, isError: false, isFetching: false,
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

beforeEach(async () => { await i18n.changeLanguage('en') })
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
