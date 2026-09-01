import { ArrowLeft, CalendarClock, DoorOpen, FileClock, Save, UsersRound } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TextareaField } from '@/components/shared/Input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MeetingFilesPanel } from '@/features/meetings/components/MeetingFilesPanel'
import { MeetingRescheduleDialog } from '@/features/meetings/components/MeetingRescheduleDialog'
import { MeetingTemplateEditorDialog } from '@/features/meetings/components/MeetingTemplateEditorDialog'
import { useCancelMeeting, useMeetingDetail } from '@/features/meetings/hooks/use-meetings'
import type { MeetingRevisionDetail } from '@/features/meetings/types/meeting.types'
import { toApiClientError } from '@/lib/api-error'
import { formatDateTime } from '@/lib/date-time'

function revisionVariant(status: MeetingRevisionDetail['revisionStatus']) {
  if (status === 'APPROVED') return 'success' as const
  if (status === 'REJECTED') return 'destructive' as const
  return 'warning' as const
}

export function MeetingDetailsPage() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const meetingId = Number(params.meetingId)
  const query = useMeetingDetail(Number.isInteger(meetingId) && meetingId > 0 ? meetingId : null)
  const cancelMutation = useCancelMeeting()
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-SA'

  if (query.isPending) return <LoadingState className="min-h-[50vh]" />
  if (query.isError || !query.data) return <ErrorState className="min-h-[50vh]" onRetry={() => void query.refetch()} />

  const detail = query.data
  const meeting = detail.meeting
  const durationMinutes = Math.max(1, Math.round((new Date(meeting.endAtUtc).getTime() - new Date(meeting.startAtUtc).getTime()) / 60000))

  async function cancel() {
    try {
      await cancelMutation.mutateAsync({
        meetingId: meeting.id,
        meetingRowVersion: meeting.meetingRowVersion,
        reason: cancelReason.trim() || null,
      })
      toast.success(t('meetings.workspace.cancelled'))
      setCancelOpen(false)
      setCancelReason('')
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.errors.${apiError.code}`, { defaultValue: t('meetings.workspace.cancelError') }))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('meetings.workspace.detailsEyebrow')}
        title={meeting.title}
        description={meeting.description ?? t('meetings.workspace.noDescription')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/meetings')}>
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
              {t('meetings.workspace.back')}
            </Button>
            {detail.permissions.canSaveAsTemplate ? (
              <Button variant="outline" onClick={() => setTemplateOpen(true)}>
                <Save className="size-4" aria-hidden="true" />
                {t('meetings.templates.saveAsTemplate')}
              </Button>
            ) : null}
            {detail.permissions.canReschedule ? <Button variant="outline" onClick={() => setRescheduleOpen(true)}>{t('meetings.workspace.requestReschedule')}</Button> : null}
            {detail.permissions.canCancel ? <Button variant="destructive" onClick={() => setCancelOpen(true)}>{t('meetings.workspace.cancelMeeting')}</Button> : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t('meetings.workspace.currentSchedule')}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{t('meetings.organizedBy', { name: meeting.organizer.userName })}</p>
            </div>
            <Badge variant={meeting.status === 'SCHEDULED' ? 'success' : meeting.status === 'PENDING_APPROVAL' ? 'warning' : meeting.status === 'REJECTED' ? 'destructive' : 'secondary'}>{t(`meetings.status.${meeting.status}`)}</Badge>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="bg-muted/40 flex gap-3 rounded-lg border p-4"><CalendarClock className="text-muted-foreground size-5 shrink-0" /><div><p className="font-medium">{formatDateTime(meeting.startAtUtc, locale)}</p><p className="text-muted-foreground mt-1 text-sm">{t('meetings.endsAt', { value: formatDateTime(meeting.endAtUtc, locale) })}</p></div></div>
            <div className="bg-muted/40 flex gap-3 rounded-lg border p-4"><DoorOpen className="text-muted-foreground size-5 shrink-0" /><div><p className="font-medium">{i18n.language.startsWith('ar') ? meeting.room.nameAr : meeting.room.nameEn}</p><p className="text-muted-foreground mt-1 text-sm">{meeting.room.locationText ?? t('meetings.noRoomLocation')}</p></div></div>
          </div>
          {meeting.schedulingNotes ? <div className="mt-4 border-s-2 ps-3"><p className="text-sm font-medium">{t('meetings.fields.schedulingNotes')}</p><p className="text-muted-foreground mt-1 text-sm">{meeting.schedulingNotes}</p></div> : null}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2"><UsersRound className="text-muted-foreground size-5" /><h2 className="font-semibold">{t('meetings.workspace.participants')}</h2></div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="rounded-lg border p-3"><p className="font-medium">{meeting.organizer.userName}</p><p className="text-muted-foreground text-xs">{t('meetings.organizer')} · {meeting.organizer.userCode}</p></div>
            {meeting.attendees.map((attendee) => <div key={attendee.userId} className="rounded-lg border p-3"><p className="font-medium">{attendee.userName}</p><p className="text-muted-foreground text-xs">{attendee.userCode}</p></div>)}
          </div>
        </Card>
      </div>

      {detail.pendingReschedule ? (
        <Card className="border-warning/35 bg-warning/5 p-5">
          <div className="flex items-center gap-2"><FileClock className="text-warning size-5" /><h2 className="font-semibold">{t('meetings.workspace.pendingReschedule')}</h2></div>
          <p className="text-muted-foreground mt-2 text-sm">{t('meetings.workspace.pendingRescheduleDescription')}</p>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div>{formatDateTime(detail.pendingReschedule.startAtUtc, locale)} → {formatDateTime(detail.pendingReschedule.endAtUtc, locale)}</div><div>{i18n.language.startsWith('ar') ? detail.pendingReschedule.room.nameAr : detail.pendingReschedule.room.nameEn}</div></div>
        </Card>
      ) : null}

      <MeetingFilesPanel meetingId={meeting.id} canManage={detail.permissions.canManageAttachments} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">{t('meetings.workspace.scheduleHistory')}</h2>
          <div className="mt-4 space-y-3">
            {detail.revisions.map((revision) => (
              <div key={revision.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2"><p className="font-medium">{t('meetings.workspace.revision', { number: revision.revisionNumber })}</p><Badge variant={revisionVariant(revision.revisionStatus)}>{t(`meetings.workspace.revisionStatus.${revision.revisionStatus}`)}</Badge></div>
                <p className="text-muted-foreground mt-2 text-sm">{formatDateTime(revision.startAtUtc, locale)} → {formatDateTime(revision.endAtUtc, locale)}</p>
                <p className="text-muted-foreground mt-1 text-sm">{i18n.language.startsWith('ar') ? revision.room.nameAr : revision.room.nameEn}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">{t('meetings.workspace.activity')}</h2>
          <div className="mt-4 space-y-3">
            {detail.activity.map((item) => (
              <div key={item.id} className="border-s-2 ps-3">
                <p className="text-sm font-medium">{t(`meetings.workspace.activityTypes.${item.activityType}`, { defaultValue: item.activityType })}</p>
                <p className="text-muted-foreground mt-1 text-xs">{item.actor.userName} · {formatDateTime(item.createdAtUtc, locale)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {rescheduleOpen ? <MeetingRescheduleDialog detail={detail} open onOpenChange={setRescheduleOpen} /> : null}
      {templateOpen ? <MeetingTemplateEditorDialog open initialMeeting={{ title: meeting.title, description: meeting.description, roomId: meeting.room.id, attendeeUserIds: meeting.attendees.map((item) => item.userId), durationMinutes }} onOpenChange={setTemplateOpen} /> : null}
      <ConfirmModal open={cancelOpen} title={t('meetings.workspace.cancelTitle')} message={t('meetings.workspace.cancelDescription', { title: meeting.title })} confirmText={t('meetings.workspace.cancelMeeting')} cancelText={t('common.cancel')} danger loading={cancelMutation.isPending} onConfirm={() => void cancel()} onCancel={() => { setCancelOpen(false); setCancelReason('') }}>
        <TextareaField label={t('meetings.workspace.cancelReason')} value={cancelReason} maxLength={1000} onChange={(event) => setCancelReason(event.target.value)} />
      </ConfirmModal>
    </div>
  )
}
