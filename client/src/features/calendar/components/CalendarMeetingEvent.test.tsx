import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MeetingScheduleEntry } from '@/features/meetings/types/meeting.types'

import { CalendarMeetingEvent } from './CalendarMeetingEvent'

const organizer = { userId: 3, userCode: 'U003', userName: 'Organizer' }
const room = {
  id: 4,
  code: 'BR',
  nameAr: 'قاعة الاجتماعات',
  nameEn: 'Board Room',
  locationText: 'First floor',
}

describe('CalendarMeetingEvent', () => {
  it('does not expose an unrelated busy Meeting title', () => {
    const meeting: MeetingScheduleEntry = {
      visibility: 'BUSY',
      meetingId: null,
      title: null,
      organizer,
      room,
      startAtUtc: '2026-09-02T05:00:00.000Z',
      endAtUtc: '2026-09-02T07:00:00.000Z',
    }

    render(<CalendarMeetingEvent meeting={meeting} monthGrid={false} timeText="08:00 - 10:00" />)

    expect(screen.getByText(/Busy/i)).toBeVisible()
    expect(screen.getByText(/Organizer/i)).toBeVisible()
    expect(screen.queryByText(/confidential/i)).not.toBeInTheDocument()
  })

  it('shows the title for a fully visible Meeting', () => {
    const meeting: MeetingScheduleEntry = {
      visibility: 'FULL',
      meetingId: 15,
      title: 'Monthly IT Meeting',
      organizer,
      room,
      startAtUtc: '2026-09-02T05:00:00.000Z',
      endAtUtc: '2026-09-02T07:00:00.000Z',
    }

    render(<CalendarMeetingEvent meeting={meeting} monthGrid timeText="08:00" />)

    expect(screen.getByText('Monthly IT Meeting')).toBeVisible()
  })
})
