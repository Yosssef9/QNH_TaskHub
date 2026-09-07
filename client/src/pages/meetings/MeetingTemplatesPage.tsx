import { Clock3, DoorOpen, Plus, UserRound, UsersRound } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { MeetingCollectionState } from '@/features/meetings/components/MeetingCollectionState'
import { formatMeetingDuration } from '@/features/meetings/components/MeetingDurationPicker'
import { MeetingEditorDialog } from '@/features/meetings/components/MeetingEditorDialog'
import { MeetingTemplateEditorDialog } from '@/features/meetings/components/MeetingTemplateEditorDialog'
import {
  useArchiveMeetingTemplate,
  useMeetingTemplates,
} from '@/features/meetings/hooks/use-meetings'
import type { MeetingTemplate } from '@/features/meetings/types/meeting.types'
import { toApiClientError } from '@/lib/api-error'

export function MeetingTemplatesPage() {
  const { i18n, t } = useTranslation()
  const currentUser = useCurrentUser()
  const canCoordinate = currentUser.data?.access.meetingCoordinateEnabled === true
  const templates = useMeetingTemplates(true)
  const archiveTemplate = useArchiveMeetingTemplate()

  const [templateEditor, setTemplateEditor] = useState<MeetingTemplate | 'NEW' | null>(null)
  const [templateForMeeting, setTemplateForMeeting] = useState<MeetingTemplate | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<MeetingTemplate | null>(null)

  async function archivePersonalTemplate() {
    if (!archiveTarget) return
    try {
      await archiveTemplate.mutateAsync({
        templateId: archiveTarget.id,
        rowVersion: archiveTarget.rowVersion,
      })
      toast.success(t('meetings.templates.archived'))
      setArchiveTarget(null)
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.templates.archiveError'),
        }),
      )
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('meetings.eyebrow')}
        title={t('meetings.templates.title')}
        description={t('meetings.templates.description')}
        actions={
          <Button onClick={() => setTemplateEditor('NEW')}>
            <Plus aria-hidden="true" className="size-4" />
            {t('meetings.templates.create')}
          </Button>
        }
      />

      <MeetingCollectionState
        pending={templates.isPending}
        error={templates.isError}
        empty={(templates.data?.length ?? 0) === 0}
        emptyTitle={t('meetings.templates.emptyTitle')}
        emptyDescription={t('meetings.templates.emptyDescription')}
        onRetry={() => void templates.refetch()}
      >
        {(templates.data ?? []).map((template) => (
          <Card key={template.id} className="p-4 sm:p-5">
            <h3 className="font-semibold">{template.name}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{template.title}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <Clock3 aria-hidden="true" className="text-muted-foreground size-3.5" />
                {formatMeetingDuration(template.durationMinutes, t)}
              </span>
              <span className="bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <UsersRound aria-hidden="true" className="text-muted-foreground size-3.5" />
                {t('meetings.templates.participantsSummary', {
                  count: template.attendees.length + (template.organizerAttending ? 1 : 0),
                })}
              </span>
              <span className="bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <UserRound aria-hidden="true" className="text-muted-foreground size-3.5" />
                {t(
                  template.organizerAttending
                    ? 'meetings.templates.organizerAttending'
                    : 'meetings.templates.organizerNotAttending',
                )}
              </span>
              {template.defaultRoom ? (
                <span className="bg-muted/40 inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                  <DoorOpen aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="max-w-52 truncate">
                    {i18n.language.startsWith('ar') ? template.defaultRoom.nameAr : template.defaultRoom.nameEn}
                  </span>
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
              <Button variant="ghost" size="sm" onClick={() => setTemplateForMeeting(template)}>
                {t('meetings.templates.use')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setTemplateEditor(template)}>
                {t('common.edit')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setArchiveTarget(template)}>
                {t('meetings.templates.archive')}
              </Button>
            </div>
          </Card>
        ))}
      </MeetingCollectionState>

      {templateForMeeting ? (
        <MeetingEditorDialog
          key={`template-${templateForMeeting.id}`}
          open
          mode={canCoordinate ? 'DIRECT' : 'REQUEST'}
          template={templateForMeeting}
          onOpenChange={(open) => {
            if (!open) setTemplateForMeeting(null)
          }}
        />
      ) : null}

      {templateEditor ? (
        <MeetingTemplateEditorDialog
          key={templateEditor === 'NEW' ? 'new-template' : templateEditor.id}
          open
          template={templateEditor === 'NEW' ? null : templateEditor}
          onOpenChange={(open) => {
            if (!open) setTemplateEditor(null)
          }}
        />
      ) : null}

      <ConfirmModal
        open={archiveTarget !== null}
        title={t('meetings.templates.archiveTitle')}
        message={t('meetings.templates.archiveDescription', { name: archiveTarget?.name ?? '' })}
        confirmText={t('meetings.templates.archive')}
        cancelText={t('common.cancel')}
        loading={archiveTemplate.isPending}
        onConfirm={() => void archivePersonalTemplate()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  )
}
