import type { MeetingAgendaItemInput, MeetingParticipant, MeetingStatus } from '../types/meeting.types'

export const MEETING_SERIES_TIME_ZONE = 'Asia/Riyadh' as const
export const MEETING_SERIES_MAX_OCCURRENCES = 100

export const MEETING_SERIES_WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const

export type MeetingSeriesWeekday = (typeof MEETING_SERIES_WEEKDAYS)[number]
export type MeetingSeriesCreationMode = 'PATTERN' | 'CUSTOM'
export type MeetingSeriesOccurrenceSource = 'PATTERN' | 'CUSTOM' | 'ADDED'
export type MeetingSeriesOverrideKind =
  | 'DATE'
  | 'TIME'
  | 'ROOM'
  | 'TITLE'
  | 'DESCRIPTION'
  | 'ATTENDEES'
  | 'ORGANIZER_ATTENDANCE'
  | 'AGENDA'
  | 'ATTACHMENTS'

export interface MeetingSeriesDefaultsInput {
  title: string
  description: string | null
  organizerAttending: boolean
  attendeeUserIds: number[]
  agendaItems: MeetingAgendaItemInput[]
  roomId: number
  startTime: string
  endTime: string
}

export type MeetingSeriesPattern =
  | { type: 'DAILY'; interval: number }
  | { type: 'WEEKLY'; interval: number; daysOfWeek: MeetingSeriesWeekday[] }
  | { type: 'MONTHLY_DATE'; interval: number; dayOfMonth: number }
  | {
      type: 'MONTHLY_RELATIVE'
      interval: number
      ordinal: 1 | 2 | 3 | 4 | -1
      dayOfWeek: MeetingSeriesWeekday
    }

export type MeetingSeriesRange =
  | { type: 'END_DATE'; startDate: string; endDate: string }
  | { type: 'COUNT'; startDate: string; count: number }

export type MeetingSeriesScheduleInput =
  | {
      mode: 'PATTERN'
      pattern: MeetingSeriesPattern
      range: MeetingSeriesRange
    }
  | {
      mode: 'CUSTOM'
      dates: string[]
    }

export interface MeetingSeriesOccurrenceDetailOverride {
  title?: string
  description?: string | null
  organizerAttending?: boolean
  attendeeUserIds?: number[]
  agendaItems?: MeetingAgendaItemInput[]
}

export interface MeetingSeriesScheduleOverride extends MeetingSeriesOccurrenceDetailOverride {
  action: 'OVERRIDE'
  occurrenceKey: string
  date?: string
  startTime?: string
  endTime?: string
  roomId?: number
}

export interface MeetingSeriesRemoveException {
  action: 'REMOVE'
  occurrenceKey: string
}

export interface MeetingSeriesAddException extends MeetingSeriesOccurrenceDetailOverride {
  action: 'ADD'
  clientOccurrenceId: string
  date: string
  startTime?: string
  endTime?: string
  roomId?: number
}

export type MeetingSeriesException =
  | MeetingSeriesScheduleOverride
  | MeetingSeriesRemoveException
  | MeetingSeriesAddException

export interface MeetingSeriesPreviewInput {
  timeZone: typeof MEETING_SERIES_TIME_ZONE
  defaults: MeetingSeriesDefaultsInput
  schedule: MeetingSeriesScheduleInput
  exceptions: MeetingSeriesException[]
}

export interface MeetingSeriesValidationIssue {
  code: string
  message: string
  details?: unknown
}

export interface MeetingSeriesPreviewOccurrence {
  occurrenceKey: string
  sequenceNumber: number
  sourceType: MeetingSeriesOccurrenceSource
  originalDate: string | null
  originalStartTime: string | null
  originalEndTime: string | null
  originalStartAtUtc: string | null
  originalEndAtUtc: string | null
  date: string
  startTime: string
  endTime: string
  startAtUtc: string
  endAtUtc: string
  roomId: number
  title: string
  description: string | null
  organizerAttending: boolean
  attendeeUserIds: number[]
  agendaItems: MeetingAgendaItemInput[]
  overrideKinds: MeetingSeriesOverrideKind[]
  isCustomized: boolean
  participantCount: number
  roomCapacity: number | null
  validation: {
    isValid: boolean
    issues: MeetingSeriesValidationIssue[]
  }
}

export interface MeetingSeriesPreview {
  creationMode: MeetingSeriesCreationMode
  timeZone: typeof MEETING_SERIES_TIME_ZONE
  occurrenceCount: number
  customizedCount: number
  canCreate: boolean
  occurrences: MeetingSeriesPreviewOccurrence[]
}

export interface CreateMeetingSeriesInput extends MeetingSeriesPreviewInput {
  creationRequestId: string
}

export interface MeetingSeriesCreateResult {
  seriesId: number
  creationRequestId: string
  meetingIds: number[]
  replayed: boolean
}

export interface MeetingSeriesAttachmentUploadInput {
  seriesId: number
  attachmentRequestId: string
  scope: 'COMMON' | 'OCCURRENCE'
  occurrenceKey?: string
  file: File
}

export interface MeetingSeriesAttachmentUploadResult {
  seriesId: number
  attachmentRequestId: string
  scope: 'COMMON' | 'OCCURRENCE'
  occurrenceKey: string | null
  associatedMeetingCount: number
  replayed: boolean
}




export type MeetingSeriesDerivedState = 'UPCOMING' | 'COMPLETED' | 'ALL_CANCELLED'
export type MeetingSeriesListState = 'ALL' | MeetingSeriesDerivedState

export interface MeetingSeriesNextMeetingSummary {
  meetingId: number
  title: string
  status: MeetingStatus
  startAtUtc: string
  endAtUtc: string
  roomId: number
  roomNameAr: string
  roomNameEn: string
}

export interface MeetingSeriesListItem {
  seriesId: number
  creationMode: MeetingSeriesCreationMode
  title: string
  createdAtUtc: string
  originalStartAtUtc: string
  originalEndAtUtc: string
  meetingCount: number
  upcomingCount: number
  cancelledCount: number
  customizedCount: number
  state: MeetingSeriesDerivedState
  nextMeeting: MeetingSeriesNextMeetingSummary | null
}

export interface MeetingSeriesListResult {
  items: MeetingSeriesListItem[]
  page: number
  pageSize: number
  total: number
}

export interface MeetingSeriesListInput {
  search?: string
  state?: MeetingSeriesListState
  page?: number
  pageSize?: number
}

export interface MeetingSeriesMemberSummary {
  meetingId: number
  sequenceNumber: number
  occurrenceKey: string
  sourceType: MeetingSeriesOccurrenceSource
  title: string
  description: string | null
  status: MeetingStatus
  currentStartAtUtc: string | null
  currentEndAtUtc: string | null
  currentRoomId: number | null
  currentRoomNameAr: string | null
  currentRoomNameEn: string | null
  originalStartAtUtc: string | null
  originalEndAtUtc: string | null
  initialStartAtUtc: string
  initialEndAtUtc: string
  initialRoomId: number
  initialRoomNameAr: string
  initialRoomNameEn: string
  customizationJson: string | null
  wasCustomizedAtCreation: boolean
}

export interface MeetingSeriesDetail {
  seriesId: number
  createdByUserId: number
  creationMode: MeetingSeriesCreationMode
  timeZone: typeof MEETING_SERIES_TIME_ZONE
  createdAtUtc: string
  rowVersion: string
  defaults: MeetingSeriesDefaultsInput
  schedule: MeetingSeriesScheduleInput
  exceptions: MeetingSeriesException[]
  defaultAttendees: MeetingParticipant[]
  meetingCount: number
  upcomingCount: number
  cancelledCount: number
  customizedCount: number
  state: MeetingSeriesDerivedState
  members: MeetingSeriesMemberSummary[]
}

export interface MeetingSeriesMembershipLink {
  seriesId: number
  seriesTitle: string
  sequenceNumber: number
  meetingCount: number
}

