import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import type { MeetingScheduleEntry } from '@/features/meetings/types/meeting.types'

import { CalendarMeetingEvent } from './CalendarMeetingEvent'

const organizer = { userId: 3, userCode: 'U003', userName: 'Organizer' }
const room = {
  id: 4,
  code: 'BR',
  nameAr: 'قاعة الاجتماعات',
  nameEn: 'Board Room',
  locationText: 'First floor',
  colorKey: 'GREEN' as const,
}

function renderEvent(meeting: MeetingScheduleEntry, viewType: string, timeText: string) {
  return render(
    <TooltipProvider delayDuration={0}>
      <CalendarMeetingEvent meeting={meeting} viewType={viewType} timeText={timeText} />
    </TooltipProvider>,
  )
}

function fullMeeting(hasPendingReschedule: boolean): MeetingScheduleEntry {
  return {
    visibility: 'FULL',
    meetingId: 15,
    title: 'Monthly IT Meeting',
    organizer,
    room,
    startAtUtc: '2026-09-02T05:00:00.000Z',
    endAtUtc: '2026-09-02T07:00:00.000Z',
    participantCount: 3,
    agendaTopicCount: 2,
    agendaPlannedMinutes: 45,
    hasPendingReschedule,
  }
}

describe('CalendarMeetingEvent', () => {
  it('does not expose a title for a BUSY-only entry', () => {
    const meeting: MeetingScheduleEntry = {
      visibility: 'BUSY',
      meetingId: null,
      title: null,
      organizer,
      room,
      startAtUtc: '2026-09-02T05:00:00.000Z',
      endAtUtc: '2026-09-02T07:00:00.000Z',
    }

    renderEvent(meeting, 'timeGridDay', '8:00 AM - 10:00 AM')

    expect(screen.getByText(/Busy/i)).toBeVisible()
    expect(screen.queryByText(/confidential/i)).not.toBeInTheDocument()
  })

  it('shows title and organizer for an Organizer preview entry', () => {
    const meeting: MeetingScheduleEntry = {
      visibility: 'PREVIEW',
      meetingId: null,
      title: 'Monthly IT Meeting',
      organizer,
      room,
      startAtUtc: '2026-09-02T05:00:00.000Z',
      endAtUtc: '2026-09-02T07:00:00.000Z',
    }

    renderEvent(meeting, 'timeGridDay', '8:00 AM - 10:00 AM')

    expect(screen.getByText('Monthly IT Meeting')).toBeVisible()
    expect(screen.getByText('Organizer')).toBeVisible()
  })

  it('shows the title for a fully visible Meeting in month view', () => {
    renderEvent(fullMeeting(false), 'dayGridMonth', '8:00 AM')

    expect(screen.getByText('Monthly IT Meeting')).toBeVisible()
  })

  it('does not repeat the normal scheduled state on a Meeting card', () => {
    renderEvent(fullMeeting(false), 'timeGridDay', '8:00 AM - 10:00 AM')

    expect(screen.queryByText(/^Scheduled$/i)).not.toBeInTheDocument()
  })

  it('keeps the exceptional reschedule-request badge visible', () => {
    renderEvent(fullMeeting(true), 'timeGridDay', '8:00 AM - 10:00 AM')

    expect(screen.getByText(/Reschedule requested/i)).toBeVisible()
  })
})
