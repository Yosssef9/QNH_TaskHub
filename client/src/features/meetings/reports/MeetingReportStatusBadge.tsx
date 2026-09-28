import { CheckCircle2, Clock3, LoaderCircle, Mail, MailX, RefreshCcw, TriangleAlert, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { reportStatusPresentation } from './meeting-report-status.presentation'
import type { MeetingReportSchedule } from './meeting-report-status.types'

export function MeetingReportStatusBadge({ data, detailed = false }: {
  data: MeetingReportSchedule
  detailed?: boolean
}) {
  const { t } = useTranslation()
  const presentation = reportStatusPresentation(data)
  const state = data.delivery.state
  const Icon = state === 'SENT' ? CheckCircle2
    : state === 'PROCESSING' ? LoaderCircle
    : state === 'RETRYING' ? RefreshCcw
    : state === 'PARTIAL' || state === 'REVIEW_REQUIRED' ? TriangleAlert
    : state === 'FAILED' ? XCircle
    : state === 'SKIPPED' || presentation.key === 'notEnabled' ? MailX
    : state === 'QUEUED' ? Mail : Clock3
  return (
    <Badge variant={presentation.variant} className="max-w-full gap-1.5 whitespace-normal text-start leading-5">
      <Icon aria-hidden="true" className={state === 'PROCESSING' ? 'size-3.5 shrink-0 motion-safe:animate-spin' : 'size-3.5 shrink-0'} />
      <span>{t(`meetings.report.automatic.${detailed ? '' : 'compact.'}${presentation.key}`)}</span>
    </Badge>
  )
}
