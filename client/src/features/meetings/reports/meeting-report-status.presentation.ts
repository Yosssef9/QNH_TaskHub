import type { MeetingReportSchedule } from './meeting-report-status.types'

type BadgeVariant = 'default' | 'secondary' | 'warning' | 'success' | 'destructive'

/** Presentation only: due/eligible/sent are decided by the server, never by the browser clock. */
export function reportStatusPresentation(data: MeetingReportSchedule): { key: string; variant: BadgeVariant } {
  if (data.delivery.state !== 'NOT_QUEUED') {
    const state = data.delivery.state
    return {
      key: `delivery.${state}`,
      variant: state === 'SENT' ? 'success' : state === 'QUEUED' || state === 'PROCESSING' ? 'default' : state === 'FAILED' || state === 'REVIEW_REQUIRED'
        ? 'destructive' : state === 'SKIPPED' ? 'secondary' : 'warning',
    }
  }
  if (data.scheduleState !== 'WAITING' && data.scheduleState !== 'DUE') {
    return { key: `schedule.${data.scheduleState}`, variant: 'secondary' }
  }
  if (!data.automaticDeliveryEnabled) return { key: 'notEnabled', variant: 'secondary' }
  return { key: `schedule.${data.scheduleState}`, variant: data.scheduleState === 'DUE' ? 'warning' : 'default' }
}

