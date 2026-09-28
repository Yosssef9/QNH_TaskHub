import { describe, expect, it } from 'vitest'
import { reportStatusPresentation } from './meeting-report-status.presentation'
import { hasReportDeliveryEvidence, reportDeliveryCounts, reportRowTiming } from './meeting-report-status.view'
import type { MeetingReportSchedule, ReportDeliveryState, ReportScheduleState } from './meeting-report-status.types'

function fixture(): MeetingReportSchedule {
  return {
    meetingId: 127, meetingStatus: 'SCHEDULED', approvedRevisionId: 12,
    approvedStartAtUtc: '2026-09-28T06:00:00Z', approvedEndAtUtc: '2026-09-28T07:00:00Z',
    reportDueAtUtc: '2026-09-28T07:30:00Z', graceMinutes: 30, scheduleState: 'WAITING',
    hasPendingReschedule: false, checkedAtUtc: '2026-09-28T07:10:00Z', timeZone: 'Asia/Riyadh', automaticDeliveryEnabled: true,
    delivery: { state: 'NOT_QUEUED', totalRecipients: 8, sent: 0, queued: 0, processing: 0, retrying: 0, failed: 0, skipped: 0, notQueued: 8, needsReview: 0, lastSentAtUtc: null, nextAttemptAtUtc: null },
  }
}

describe('Compact report summary', () => {
  it('shows approved report timing, not a browser-derived send state', () => {
    const data = fixture()
    expect(reportRowTiming(data)).toEqual({ label: 'scheduledFor', at: data.reportDueAtUtc })
    expect(reportStatusPresentation(data)).toEqual({ key: 'schedule.WAITING', variant: 'default' })
    data.scheduleState = 'DUE'
    expect(reportStatusPresentation(data).key).toBe('schedule.DUE')
    expect(hasReportDeliveryEvidence(data)).toBe(false)
  })
  it.each(['AWAITING_APPROVAL', 'CANCELLED', 'REJECTED', 'BEFORE_ACTIVATION', 'INVALID_SCHEDULE'] as ReportScheduleState[])(
    'does not promise an active time for %s', (state) => {
      const data = { ...fixture(), scheduleState: state }
      expect(reportRowTiming(data)).toBeNull()
      expect(reportStatusPresentation(data).key).toBe(`schedule.${state}`)
    },
  )
  it('labels disabled time as a calculation', () => {
    const data = { ...fixture(), automaticDeliveryEnabled: false }
    expect(reportStatusPresentation(data).key).toBe('notEnabled')
    expect(reportRowTiming(data)?.label).toBe('calculatedFor')
  })
  it.each(['QUEUED', 'PROCESSING', 'RETRYING', 'SENT', 'PARTIAL', 'FAILED', 'SKIPPED', 'REVIEW_REQUIRED'] as ReportDeliveryState[])(
    'keeps the server %s delivery state', (state) => {
      const data = fixture(); data.delivery.state = state
      expect(reportStatusPresentation(data).key).toBe(`delivery.${state}`)
    },
  )
  it('uses the actual send time even when future sending is paused', () => {
    const data = fixture(); data.automaticDeliveryEnabled = false
    data.delivery.state = 'SENT'; data.delivery.lastSentAtUtc = '2026-09-28T07:32:00Z'
    expect(reportRowTiming(data)).toEqual({ label: 'lastSent', at: data.delivery.lastSentAtUtc })
  })
  it('uses next attempt only for enabled retries', () => {
    const data = fixture(); data.delivery.state = 'RETRYING'; data.delivery.nextAttemptAtUtc = '2026-09-28T07:40:00Z'
    expect(reportRowTiming(data)?.label).toBe('nextAttempt')
    data.automaticDeliveryEnabled = false
    expect(reportRowTiming(data)?.label).toBe('calculatedFor')
  })
  it('keeps partial failure and skipped counts instead of a false all-sent message', () => {
    const data = fixture()
    data.delivery = { ...data.delivery, state: 'PARTIAL', sent: 6, failed: 1, skipped: 1, notQueued: 0 }
    expect(hasReportDeliveryEvidence(data)).toBe(true)
    expect(reportDeliveryCounts(data)).toEqual([{ key: 'sent', count: 6 }, { key: 'failed', count: 1 }, { key: 'skipped', count: 1 }])
    expect(reportDeliveryCounts(data, true)).toHaveLength(8)
    expect(reportStatusPresentation(data).variant).toBe('warning')
  })
  it('retains failures alongside processing counts', () => {
    const data = fixture(); data.delivery.state = 'PROCESSING'; data.delivery.failed = 1; data.delivery.processing = 7; data.delivery.notQueued = 0
    expect(reportDeliveryCounts(data)).toContainEqual({ key: 'failed', count: 1 })
  })
  it('labels a terminal delivery due time as original, not a future send promise', () => {
    const data = fixture(); data.delivery.state = 'FAILED'
    expect(reportRowTiming(data)?.label).toBe('compact.originalDue')
  })
})
