import { describe, expect, it } from 'vitest'

import {
  buildParticipantAvailabilityInput,
  participantUserIdsFromMeeting,
} from './meeting-participant-availability'

describe('meeting participant availability helpers', () => {
  it('includes an attending organizer and deduplicates attendee ids', () => {
    expect(
      participantUserIdsFromMeeting({
        organizer: { userId: 10, userCode: 'U10', userName: 'Organizer' },
        organizerAttending: true,
        attendees: [
          { userId: 20, userCode: 'U20', userName: 'A' },
          { userId: 20, userCode: 'U20', userName: 'A' },
        ],
      }),
    ).toEqual([20, 10])
  })

  it('does not treat a non-attending organizer as a participant', () => {
    expect(
      participantUserIdsFromMeeting({
        organizer: { userId: 10, userCode: 'U10', userName: 'Organizer' },
        organizerAttending: false,
        attendees: [{ userId: 20, userCode: 'U20', userName: 'A' }],
      }),
    ).toEqual([20])
  })

  it('builds a privacy-safe availability request and preserves current Meeting exclusion', () => {
    expect(
      buildParticipantAvailabilityInput({
        startAtUtc: '2026-09-28T07:00:00.000Z',
        endAtUtc: '2026-09-28T08:00:00.000Z',
        participantUserIds: [20, 20, 30],
        excludeMeetingId: 99,
      }),
    ).toEqual({
      startAtUtc: '2026-09-28T07:00:00.000Z',
      endAtUtc: '2026-09-28T08:00:00.000Z',
      participantUserIds: [20, 30],
      excludeMeetingId: 99,
    })
  })

  it('does not query without a usable time window or participant', () => {
    expect(
      buildParticipantAvailabilityInput({
        startAtUtc: '2026-09-28T08:00:00.000Z',
        endAtUtc: '2026-09-28T07:00:00.000Z',
        participantUserIds: [20],
      }),
    ).toBeNull()
    expect(
      buildParticipantAvailabilityInput({
        startAtUtc: '2026-09-28T07:00:00.000Z',
        endAtUtc: '2026-09-28T08:00:00.000Z',
        participantUserIds: [],
      }),
    ).toBeNull()
  })
})
