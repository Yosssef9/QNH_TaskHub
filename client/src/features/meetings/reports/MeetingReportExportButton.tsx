import { useMutation } from '@tanstack/react-query'
import { FileDown, LoaderCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { toApiClientError } from '@/lib/api-error'
import { downloadMeetingReport } from './meeting-report.api'

/** Visible for every successfully authorized Meeting Details page, regardless of lifecycle state. */
export function MeetingReportExportButton({ meetingId, className }: { meetingId: number; className?: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language.toLowerCase().startsWith('ar') ? 'ar' : 'en'
  const mutation = useMutation({
    mutationFn: () => downloadMeetingReport(meetingId, language),
    retry: false,
    onSuccess: () => toast.success(t('meetings.report.downloadStarted')),
    onError: (error) => {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.report.errors.${apiError.code}`, {
        defaultValue: t('meetings.report.failed'),
      }))
    },
  })

  return (
    <Button
      type="button"
      variant="default"
      className={className}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      title={t('meetings.report.hint')}
      disabled={mutation.isPending}
      aria-busy={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <FileDown aria-hidden="true" className="size-4" />
      )}
      <span aria-live="polite">{t(mutation.isPending ? 'meetings.report.generating' : 'meetings.report.export')}</span>
    </Button>
  )
}

