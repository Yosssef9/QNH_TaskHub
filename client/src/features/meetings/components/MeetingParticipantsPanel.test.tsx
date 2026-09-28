// @vitest-environment jsdom
import '@/test/setup'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { MeetingParticipantsPanel } from './MeetingParticipantsPanel'
import type { MeetingAttendanceParticipant } from '../types/meeting.types'

const organizer = { userId: 1, userCode: 'U1', userName: 'Meeting Organizer' }
const attendees = Array.from({ length: 30 }, (_, index) => ({ userId: index + 2, userCode: `U${index + 2}`, userName: `Participant ${index + 2}` }))
const attendance: MeetingAttendanceParticipant[] = [organizer, ...attendees].map((participant) => ({
  participant, role: participant.userId === 1 ? 'ORGANIZER' : 'ATTENDEE', status: 'NOT_MARKED', markedBy: null, markedAtUtc: null,
}))
function props() {
  return {
    meeting: { organizer, attendees, organizerAttending: true, participantCount: 31 }, attendance,
    canManageAttendance: true, showStartNotice: false, isSaving: false,
    onChangeAttendance: vi.fn(), onChangeAllAttendance: vi.fn(),
  }
}
beforeEach(async () => { await i18n.changeLanguage('en') })
afterEach(async () => { await i18n.changeLanguage('ar') })

describe('Participants scrolling layout contract', () => {
  it('keeps all rows in a keyboard-focusable scroll region while controls stay outside', () => {
    render(<MeetingParticipantsPanel {...props()} />)
    const region = screen.getByRole('region', { name: 'Participants and attendance list' })
    expect(region).toHaveClass('meeting-participants-list')
    expect(region).toHaveAttribute('tabindex', '0')
    expect(within(region).getAllByRole('listitem')).toHaveLength(31)
    expect(region).not.toContainElement(screen.getByRole('button', { name: 'Mark all attended' }))
    expect(region).not.toContainElement(screen.getByRole('heading', { name: 'Participants' }))
  })
  it('renders a small meeting without placeholder rows', () => {
    const options = props(); options.meeting.attendees = attendees.slice(0, 1); options.meeting.participantCount = 2; options.attendance = attendance.slice(0, 2)
    render(<MeetingParticipantsPanel {...options} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
  it('preserves bulk callback values', () => {
    const options = props(); render(<MeetingParticipantsPanel {...options} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark all attended' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear attendance' }))
    expect(options.onChangeAllAttendance.mock.calls).toEqual([['ATTENDED'], ['NOT_MARKED']])
  })
  it('does not offer mutation controls to a read-only viewer', () => {
    render(<MeetingParticipantsPanel {...props()} canManageAttendance={false} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(31)
  })
  it('disables every update control during saving', () => {
    render(<MeetingParticipantsPanel {...props()} isSaving />)
    for (const control of [...screen.getAllByRole('combobox'), ...screen.getAllByRole('button')]) expect(control).toBeDisabled()
  })
  it('shows the before-start explanation without enabling attendance', () => {
    render(<MeetingParticipantsPanel {...props()} canManageAttendance={false} showStartNotice />)
    expect(screen.getByText(/Attendance can be recorded by the Meeting Organizer/)).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
  it('does not invent an attendance record for a non-attending organizer', () => {
    const options = props(); options.meeting.organizerAttending = false; options.attendance = attendance.slice(1); options.meeting.participantCount = 30
    render(<MeetingParticipantsPanel {...options} />)
    expect(screen.queryByRole('combobox', { name: 'Attendance for Meeting Organizer' })).not.toBeInTheDocument()
    expect(screen.getByText('Meeting Organizer')).toBeVisible()
    expect(screen.getAllByRole('combobox')).toHaveLength(30)
  })
})
