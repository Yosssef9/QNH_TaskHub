import type { MeetingRoomColorKey } from '../meeting-room-colors'

export interface MeetingRoom {
  id: number
  code: string | null
  nameAr: string
  nameEn: string
  locationText: string | null
  colorKey: MeetingRoomColorKey
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
  colorKey: MeetingRoomColorKey | null
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
  hasPendingReschedule: boolean
  revisionId: number
  revisionCreatedAtUtc?: string
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

export interface MeetingAgendaItemInput {
  topic: string
  presenterUserId: number | null
  plannedDurationMinutes: number | null
}

export interface UpdateMeetingAgendaInput {
  meetingId: number
  meetingRowVersion: string
  agendaItems: MeetingAgendaItemInput[]
}

export interface MeetingAgendaItem {
  id: number
  topic: string
  presenter: MeetingParticipant | null
  plannedDurationMinutes: number | null
  sortOrder: number
  rowVersion: string
}

export interface SaveMeetingInput {
  title: string
  description: string | null
  roomId: number
  startAtUtc: string
  endAtUtc: string
  attendeeUserIds: number[]
  agendaItems: MeetingAgendaItemInput[]
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
  room: Pick<MeetingRoom, 'id' | 'code' | 'nameAr' | 'nameEn' | 'locationText' | 'colorKey'>
  startAtUtc: string
  endAtUtc: string
}

export interface MeetingScheduleFullEntry extends MeetingScheduleSharedEntry {
  visibility: 'FULL'
  meetingId: number
  title: string
  participantCount: number
  agendaTopicCount: number
  agendaPlannedMinutes: number
  hasPendingReschedule: boolean
}

export interface MeetingSchedulePreviewEntry extends MeetingScheduleSharedEntry {
  visibility: 'PREVIEW'
  meetingId: null
  title: string
}

export interface MeetingScheduleBusyEntry extends MeetingScheduleSharedEntry {
  visibility: 'BUSY'
  meetingId: null
  title: null
}

export type MeetingScheduleEntry =
  | MeetingScheduleFullEntry
  | MeetingSchedulePreviewEntry
  | MeetingScheduleBusyEntry


export type MeetingRevisionType = 'INITIAL' | 'RESCHEDULE'
export type MeetingRevisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface MeetingRevisionDetail {
  id: number
  revisionNumber: number
  revisionType: MeetingRevisionType
  revisionStatus: MeetingRevisionStatus
  room: MeetingRoom
  startAtUtc: string
  endAtUtc: string
  schedulingNotes: string | null
  requestedBy: MeetingParticipant
  approvedBy: MeetingParticipant | null
  rejectedBy: MeetingParticipant | null
  createdAtUtc: string
  decidedAtUtc: string | null
  rowVersion: string
}

export interface MeetingActivityItem {
  id: number
  activityType: string
  actor: MeetingParticipant
  changes: Record<string, unknown> | null
  createdAtUtc: string
}

export interface MeetingDetail {
  meeting: MeetingSummary
  agendaItems: MeetingAgendaItem[]
  revisions: MeetingRevisionDetail[]
  activity: MeetingActivityItem[]
  pendingReschedule: MeetingRevisionDetail | null
  permissions: {
    canCancel: boolean
    canReschedule: boolean
    canEditPendingSchedule: boolean
    canEditPendingReschedule: boolean
    canCancelPendingReschedule: boolean
    canDecidePendingRequest: boolean
    canCoordinatorReschedule: boolean
    canDecidePendingReschedule: boolean
    canManageAgenda: boolean
    canManageAttachments: boolean
    canSaveAsTemplate: boolean
  }
}

export interface MeetingRescheduleQueueItem {
  meeting: MeetingSummary
  requestedRevision: MeetingRevisionDetail
}

export interface RequestMeetingRescheduleInput {
  meetingId: number
  meetingRowVersion: string
  roomId: number
  startAtUtc: string
  endAtUtc: string
}


export interface UpdateOrganizerRescheduleInput {
  meetingId: number
  revisionId: number
  revisionRowVersion: string
  roomId: number
  startAtUtc: string
  endAtUtc: string
}

export interface CancelMeetingRescheduleRequestInput extends DecideMeetingRescheduleInput {
  reason: string | null
}

export interface DirectCoordinatorRescheduleInput {
  meetingId: number
  meetingRowVersion: string
  roomId: number
  startAtUtc: string
  endAtUtc: string
  schedulingNotes: string | null
}

export interface UpdateMeetingRescheduleInput {
  meetingId: number
  revisionId: number
  revisionRowVersion: string
  roomId: number
  startAtUtc: string
  endAtUtc: string
  schedulingNotes: string | null
}

export interface DecideMeetingRescheduleInput {
  meetingId: number
  revisionId: number
  revisionRowVersion: string
}

export interface RejectMeetingRescheduleInput extends DecideMeetingRescheduleInput {
  reason: string | null
}

export interface CancelMeetingInput {
  meetingId: number
  meetingRowVersion: string
  reason: string | null
}

export interface MeetingAttachment {
  id: string
  meetingId: number
  originalFileName: string
  mimeType: string
  fileExtension: string
  sizeBytes: number
  uploadedBy: MeetingParticipant
  createdAtUtc: string
}

export interface MeetingTemplate {
  id: number
  name: string
  title: string
  description: string | null
  durationMinutes: number
  defaultRoom: MeetingRoom | null
  attendees: MeetingParticipant[]
  rowVersion: string
}

export interface SaveMeetingTemplateInput {
  name: string
  title: string
  description: string | null
  durationMinutes: number
  defaultRoomId: number | null
  attendeeUserIds: number[]
}

export interface UpdateMeetingTemplateInput extends SaveMeetingTemplateInput {
  templateId: number
  rowVersion: string
}


