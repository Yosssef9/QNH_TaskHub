import type { MeetingReportSchedule } from './meeting-report-status.types'

export const reportDeliveryCountKeys = [
  'sent', 'queued', 'processing', 'retrying', 'failed', 'skipped', 'notQueued', 'needsReview',
] as const
export type ReportDeliveryCountKey = typeof reportDeliveryCountKeys[number]

/** Counts describe real server evidence; never manufacture recipients or delivery progress. */
export function reportDeliveryCounts(data: MeetingReportSchedule, includeZero = false) {
  return reportDeliveryCountKeys
    .map((key) => ({ key, count: data.delivery[key] }))
    .filter((item) => includeZero || item.count > 0)
}

export function hasReportDeliveryEvidence(data: MeetingReportSchedule): boolean {
  return data.delivery.totalRecipients !== data.delivery.notQueued
}

/** Pick a relevant timestamp, without deriving delivery state from the browser clock. */
export function reportRowTiming(data: MeetingReportSchedule): { label: string; at: string } | null {
  if (data.delivery.state === 'SENT' && data.delivery.lastSentAtUtc) {
    return { label: 'lastSent', at: data.delivery.lastSentAtUtc }
  }
  if (data.automaticDeliveryEnabled && data.delivery.state === 'RETRYING' && data.delivery.nextAttemptAtUtc) {
    return { label: 'nextAttempt', at: data.delivery.nextAttemptAtUtc }
  }
  if (data.delivery.state === 'PARTIAL' && data.delivery.lastSentAtUtc) {
    return { label: 'lastSent', at: data.delivery.lastSentAtUtc }
  }
  if (data.scheduleState !== 'WAITING' && data.scheduleState !== 'DUE') return null
  if (!data.reportDueAtUtc) return null
  if (data.delivery.state === 'FAILED' || data.delivery.state === 'SKIPPED' || data.delivery.state === 'REVIEW_REQUIRED') {
    return { label: 'compact.originalDue', at: data.reportDueAtUtc }
  }
  return { label: data.automaticDeliveryEnabled ? 'scheduledFor' : 'calculatedFor', at: data.reportDueAtUtc }
}
