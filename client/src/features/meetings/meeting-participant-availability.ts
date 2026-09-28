import type {
  MeetingParticipantConflictInput,
  MeetingSummary,
} from './types/meeting.types'

export function participantUserIdsFromMeeting(
  meeting: Pick<MeetingSummary, 'attendees' | 'organizer' | 'organizerAttending'>,
): number[] {
  const ids = new Set(meeting.attendees.map((participant) => participant.userId))
  if (meeting.organizerAttending) ids.add(meeting.organizer.userId)
  return [...ids]
}

export function buildParticipantAvailabilityInput(input: {
  startAtUtc: string | null
  endAtUtc: string | null
  participantUserIds: readonly number[]
  excludeMeetingId?: number | null
}): MeetingParticipantConflictInput | null {
  if (!input.startAtUtc || !input.endAtUtc) return null
  if (new Date(input.endAtUtc).getTime() <= new Date(input.startAtUtc).getTime()) return null

  const participantUserIds = [...new Set(input.participantUserIds)].filter(
    (userId) => Number.isSafeInteger(userId) && userId > 0,
  )
  if (participantUserIds.length === 0) return null

  return {
    startAtUtc: input.startAtUtc,
    endAtUtc: input.endAtUtc,
    participantUserIds,
    ...(input.excludeMeetingId ? { excludeMeetingId: input.excludeMeetingId } : {}),
  }
}
