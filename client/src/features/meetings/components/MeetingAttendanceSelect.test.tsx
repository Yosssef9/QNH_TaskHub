// @vitest-environment jsdom
import '@/test/setup'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { MeetingAttendanceStatus } from '../types/meeting.types'
import { MeetingAttendanceIndicator, MeetingAttendanceSelect } from './MeetingAttendanceSelect'

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage('ar') })

describe('Attendance status presentation', () => {
  it.each(['NOT_MARKED', 'ATTENDED', 'ABSENT'] as const)('shows an icon and text for the selected %s status', (status) => {
    render(<MeetingAttendanceSelect status={status} participantName="Alex" disabled={false} onStatusChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox', { name: 'Attendance for Alex' })
    expect(trigger.querySelector(`[data-attendance-status="${status}"] svg`)).toBeInTheDocument()
    expect(trigger).toHaveTextContent(i18n.t(`meetings.workspace.attendance.status.${status}`))
  })
  it('portals options outside a scrolling parent and changes only the selected status', async () => {
    const changed = vi.fn()
    function Example() {
      const [status, setStatus] = useState<MeetingAttendanceStatus>('NOT_MARKED')
      return <div data-testid="scroll-area" style={{ maxHeight: 60, overflowY: 'auto' }}>
        <MeetingAttendanceSelect status={status} participantName="Alex" disabled={false} onStatusChange={(next) => { changed(next); setStatus(next) }} />
      </div>
    }
    render(<Example />)
    const trigger = screen.getByRole('combobox')
    trigger.focus(); fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const listbox = await screen.findByRole('listbox')
    expect(screen.getByTestId('scroll-area')).not.toContainElement(listbox)
    expect(within(listbox).getAllByRole('option')).toHaveLength(3)
    for (const option of within(listbox).getAllByRole('option')) expect(option.querySelector('svg')).toBeInTheDocument()
    const attended = within(listbox).getByRole('option', { name: 'Attended' })
    attended.focus(); fireEvent.keyDown(attended, { key: 'Enter' })
    expect(changed).toHaveBeenCalledWith('ATTENDED')
    expect(trigger).toHaveTextContent('Attended')
    expect(trigger.querySelector('[data-attendance-status="ATTENDED"] svg')).toBeInTheDocument()
  })
  it('preserves the disabled mutation state', () => {
    render(<MeetingAttendanceSelect status="ABSENT" participantName="Alex" disabled onStatusChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
  it('provides non-interactive text/icon presentation for a viewer', () => {
    render(<MeetingAttendanceIndicator status="ABSENT" pill />)
    expect(screen.getByText('Absent')).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
  it('uses Arabic direction and labels', async () => {
    await i18n.changeLanguage('ar')
    render(<MeetingAttendanceSelect status="ATTENDED" participantName="أحمد" disabled={false} onStatusChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'حضور أحمد' })).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('combobox')).toHaveTextContent('حضر')
  })
})
