import { describe, expect, it } from 'vitest'
import { reportStatusPresentation } from './meeting-report-status.presentation'
import type { MeetingReportSchedule } from './meeting-report-status.types'

export function statusFixture(): MeetingReportSchedule {
  return { meetingId: 127, meetingStatus: 'SCHEDULED', approvedRevisionId: 12,
    approvedStartAtUtc: '2026-09-27T06:00:00Z', approvedEndAtUtc: '2026-09-27T07:00:00Z',
    reportDueAtUtc: '2026-09-27T07:30:00Z', graceMinutes: 30, scheduleState: 'DUE',
    hasPendingReschedule: false, checkedAtUtc: '2026-09-27T07:31:00Z', timeZone: 'Asia/Riyadh', automaticDeliveryEnabled: false,
    delivery: { state: 'NOT_QUEUED', totalRecipients: 2, sent: 0, queued: 0, processing: 0, retrying: 0, failed: 0, skipped: 0, notQueued: 2, needsReview: 0, lastSentAtUtc: null, nextAttemptAtUtc: null },
  }
}
describe('Report status presentation', () => {
  it('never calls a due disabled report sent or actively scheduled', () => {
    expect(reportStatusPresentation(statusFixture()).key).toBe('notEnabled')
  })
  it('uses backend eligibility for cancelled Meetings', () => {
    expect(reportStatusPresentation({ ...statusFixture(), scheduleState: 'CANCELLED' }).key).toBe('schedule.CANCELLED')
  })
  it('does not label partial success as sent to all', () => {
    const data = statusFixture(); data.delivery.state = 'PARTIAL'; data.delivery.sent = 1
    expect(reportStatusPresentation(data)).toEqual({ key: 'delivery.PARTIAL', variant: 'warning' })
  })
  it('can show existing recorded deliveries even when future dispatch is disabled', () => {
    const data = statusFixture(); data.delivery.state = 'SENT'; data.delivery.sent = 2
    expect(reportStatusPresentation(data).key).toBe('delivery.SENT')
  })
})
