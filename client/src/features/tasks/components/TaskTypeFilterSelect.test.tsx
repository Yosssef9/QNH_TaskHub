// @vitest-environment jsdom
import '@/test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TaskTypeFilterSelect } from './TaskTypeFilterSelect'

beforeEach(async () => { await i18n.changeLanguage('en') })
afterEach(async () => { await i18n.changeLanguage('ar') })

describe('TaskTypeFilterSelect', () => {
  it('shows four icon-labelled task types and updates the chosen filter', async () => {
    const change = vi.fn()
    const user = userEvent.setup()
    render(<TaskTypeFilterSelect value="ALL" onChange={change} />)
    const trigger = screen.getByRole('combobox', { name: 'Task Type' })
    expect(trigger.querySelector('svg')).not.toBeNull()
    await user.click(trigger)
    const menu = screen.getByRole('listbox')
    const options = menu.querySelectorAll('[role="option"]')
    expect(options).toHaveLength(4)
    options.forEach(option => expect(option.querySelector('svg')).not.toBeNull())
    await user.click(screen.getByRole('option', { name: 'Team Tasks' }))
    expect(change).toHaveBeenCalledWith('TEAM')
  })
})
