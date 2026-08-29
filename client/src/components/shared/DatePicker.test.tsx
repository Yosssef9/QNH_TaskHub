import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MuiDateProvider } from '@/app/providers/MuiDateProvider'
import { ThemeProvider } from '@/app/providers/ThemeProvider'
import { i18n } from '@/i18n'
import { DatePicker } from './DatePicker'

function renderDatePicker(props: React.ComponentProps<typeof DatePicker>) {
  return render(
    <ThemeProvider>
      <MuiDateProvider>
        <DatePicker {...props} />
      </MuiDateProvider>
    </ThemeProvider>,
  )
}

describe('DatePicker', () => {
  afterEach(async () => {
    await i18n.changeLanguage('ar')
  })

  it('clears an optional English date', async () => {
    await i18n.changeLanguage('en')
    const onChange = vi.fn()
    renderDatePicker({ label: 'Due date', value: '2026-08-25', onChange })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not provide a clear button for a required date', async () => {
    await i18n.changeLanguage('en')
    renderDatePicker({ label: 'Due date', value: '2026-08-25', required: true, onChange: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })
})
