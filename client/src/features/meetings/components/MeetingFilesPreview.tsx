import { Download, Eye, FileText, Paperclip, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toApiClientError } from '@/lib/api-error'

import { downloadMeetingAttachment } from '../api/meetings.api'
import { useMeetingAttachments, useUploadMeetingAttachment } from '../hooks/use-meetings'
import {
  MEETING_ATTACHMENT_EXTENSIONS,
  MEETING_ATTACHMENT_MAX_COUNT,
  formatMeetingAttachmentBytes,
  validateMeetingAttachmentFile,
} from '../meeting-attachment-policy'
import type { MeetingAttachment } from '../types/meeting.types'
import { MeetingAttachmentPreviewDialog } from './MeetingAttachmentPreviewDialog'

export function MeetingFilesPreview({
  meetingId,
  canManage,
  onOpenFull,
}: {
  meetingId: number
  canManage: boolean
  onOpenFull: () => void
}) {
  const { t } = useTranslation()
  const query = useMeetingAttachments(meetingId)
  const upload = useUploadMeetingAttachment()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<MeetingAttachment | null>(null)

  async function choose(file: File | null) {
    if (!file) return
    const validationError = validateMeetingAttachmentFile(file)
    if (validationError === 'TYPE') {
      toast.error(t('meetings.files.errors.type'))
      return
    }
    if (validationError === 'SIZE') {
      toast.error(t('meetings.files.errors.tooLarge'))
      return
    }
    try {
      await upload.mutateAsync({ meetingId, file })
      toast.success(t('meetings.files.uploaded'))
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(
        t(`meetings.errors.${apiError.code}`, {
          defaultValue: t('meetings.files.errors.upload'),
        }),
      )
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const files = query.data ?? []
  const visible = files.slice(0, 3)

  return (
    <Card className="border-border/70 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-sky-500/10 text-sky-600 dark:text-sky-300 grid size-9 shrink-0 place-items-center rounded-xl">
            <Paperclip aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 className="font-bold">{t('meetings.files.title')}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('meetings.workspace.filesPreviewDescription')}
            </p>
          </div>
        </div>
        {canManage && files.length < MEETING_ATTACHMENT_MAX_COUNT ? (
          <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <Plus aria-hidden="true" className="size-4" />
            {t('meetings.files.add')}
          </Button>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={MEETING_ATTACHMENT_EXTENSIONS.join(',')}
        onChange={(event) => void choose(event.target.files?.item(0) ?? null)}
      />

      {query.isPending ? (
        <div className="text-muted-foreground mt-5 rounded-xl border border-dashed bg-muted/10 px-4 py-7 text-center text-sm">
          {t('common.loading')}
        </div>
      ) : query.isError ? (
        <div className="text-destructive mt-5 rounded-xl border border-dashed px-4 py-7 text-center text-sm">
          {t('meetings.files.errors.preview')}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-muted/10 mt-5 rounded-xl border border-dashed px-4 py-7 text-center">
          <span className="bg-background text-primary mx-auto grid size-10 place-items-center rounded-full border shadow-xs">
            <Paperclip aria-hidden="true" className="size-4" />
          </span>
          <p className="mt-3 text-sm font-semibold">{t('meetings.files.emptyTitle')}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t('meetings.files.emptyDescription')}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {visible.map((file) => (
            <div key={file.id} className="hover:bg-muted/25 flex items-center gap-2 rounded-xl border border-border/70 p-2.5 transition-colors">
              <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-lg">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{file.originalFileName}</p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {formatMeetingAttachmentBytes(file.sizeBytes)}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" aria-label={t('meetings.files.preview')} onClick={() => setPreview(file)}>
                <Eye aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('meetings.files.download')}
                onClick={() => void downloadMeetingAttachment(file).catch(() => toast.error(t('meetings.files.errors.download')))}
              >
                <Download aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="text-primary hover:text-primary/80 mt-4 text-xs font-semibold transition-colors"
        onClick={onOpenFull}
      >
        {t('meetings.workspace.viewAllFiles')}
      </button>

      <MeetingAttachmentPreviewDialog
        attachment={preview}
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      />
    </Card>
  )
}
