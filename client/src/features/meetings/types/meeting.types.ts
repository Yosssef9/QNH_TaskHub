export interface MeetingRoom {
  id: number
  code: string | null
  nameAr: string
  nameEn: string
  locationText: string | null
  capacity: number
  equipmentNotes: string | null
  isActive: boolean
  rowVersion: string
}

export interface SaveMeetingRoomInput {
  code: string | null
  nameAr: string
  nameEn: string
  locationText: string | null
  capacity: number
  equipmentNotes: string | null
  isActive: boolean
}

export interface UpdateMeetingRoomInput extends SaveMeetingRoomInput {
  rowVersion: string
}

export type MeetingStatus = 'PENDING_APPROVAL' | 'SCHEDULED' | 'REJECTED' | 'CANCELLED'

export interface MeetingParticipant {
  userId: number
  userCode: string
  userName: string
}

export interface MeetingParticipantList {
  items: MeetingParticipant[]
  page: number
  pageSize: number
  total: number
}

export interface MeetingSummary {
  id: number
  title: string
  description: string | null
  status: MeetingStatus
  organizer: MeetingParticipant
  room: MeetingRoom
  startAtUtc: string
  endAtUtc: string
  schedulingNotes: string | null
  participantCount: number
  attendees: MeetingParticipant[]
  revisionId: number
  meetingRowVersion: string
  revisionRowVersion: string
}

export interface MeetingAvailabilityInput {
  roomId: number
  startAtUtc: string
  endAtUtc: string
  participantCount: number
}

export interface MeetingAvailability extends MeetingAvailabilityInput {
  roomCapacity: number
  isRoomActive: boolean
  hasCapacity: boolean
  isAvailable: boolean
  canSchedule: boolean
}

export interface SaveMeetingInput {
  title: string
  description: string | null
  roomId: number
  startAtUtc: string
  endAtUtc: string
  attendeeUserIds: number[]
}

export interface UpdatePendingMeetingScheduleInput {
  meetingId: number
  revisionId: number
  revisionRowVersion: string
  roomId: number
  startAtUtc: string
  endAtUtc: string
  schedulingNotes: string | null
}

export interface DecideMeetingRequestInput {
  meetingId: number
  revisionId: number
  revisionRowVersion: string
}

export interface RejectMeetingRequestInput extends DecideMeetingRequestInput {
  reason: string | null
}

interface MeetingScheduleSharedEntry {
  organizer: MeetingParticipant
  room: Pick<MeetingRoom, 'id' | 'code' | 'nameAr' | 'nameEn' | 'locationText'>
  startAtUtc: string
  endAtUtc: string
}

export interface MeetingScheduleFullEntry extends MeetingScheduleSharedEntry {
  visibility: 'FULL'
  meetingId: number
  title: string
}

export interface MeetingScheduleBusyEntry extends MeetingScheduleSharedEntry {
  visibility: 'BUSY'
  meetingId: null
  title: null
}

export type MeetingScheduleEntry = MeetingScheduleFullEntry | MeetingScheduleBusyEntry
