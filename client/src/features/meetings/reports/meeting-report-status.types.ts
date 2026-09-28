export type ReportScheduleState = 'WAITING' | 'DUE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'CANCELLED' | 'INVALID_SCHEDULE' | 'BEFORE_ACTIVATION'
export type ReportDeliveryState = 'NOT_QUEUED' | 'QUEUED' | 'PROCESSING' | 'RETRYING' | 'SENT' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'REVIEW_REQUIRED'

export interface MeetingReportSchedule {
  meetingId: number
  meetingStatus: 'PENDING_APPROVAL' | 'SCHEDULED' | 'REJECTED' | 'CANCELLED'
  approvedRevisionId: number | null
  approvedStartAtUtc: string | null
  approvedEndAtUtc: string | null
  reportDueAtUtc: string | null
  graceMinutes: number
  scheduleState: ReportScheduleState
  hasPendingReschedule: boolean
  checkedAtUtc: string
  timeZone: string
  automaticDeliveryEnabled: boolean
  automaticDeliveryReason?: 'ENABLED' | 'DISABLED' | 'EMAIL_DISABLED' | 'MIGRATION_REQUIRED'
  activatedAtUtc?: string | null
  lastAutomaticScanAtUtc?: string | null
  delivery: {
    state: ReportDeliveryState
    totalRecipients: number
    sent: number
    queued: number
    processing: number
    retrying: number
    failed: number
    skipped: number
    notQueued: number
    needsReview: number
    lastSentAtUtc: string | null
    nextAttemptAtUtc: string | null
  }
}

