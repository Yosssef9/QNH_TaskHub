import { Download, Eye, FileText, Paperclip, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toApiClientError } from '@/lib/api-error'

import { downloadMeetingAttachment } from '../api/meetings.api'
import { useMeetingAttachments, useRemoveMeetingAttachment, useUploadMeetingAttachment } from '../hooks/use-meetings'
import type { MeetingAttachment } from '../types/meeting.types'
import { MeetingAttachmentPreviewDialog } from './MeetingAttachmentPreviewDialog'

const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
const MAX_BYTES = 10 * 1024 * 1024

function extension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MeetingFilesPanel({ meetingId, canManage }: { meetingId: number; canManage: boolean }) {
  const { t } = useTranslation()
  const query = useMeetingAttachments(meetingId)
  const upload = useUploadMeetingAttachment()
  const remove = useRemoveMeetingAttachment()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<MeetingAttachment | null>(null)
  const [removeTarget, setRemoveTarget] = useState<MeetingAttachment | null>(null)

  async function choose(file: File | null) {
    if (!file) return
    if (!allowedExtensions.includes(extension(file.name))) {
      toast.error(t('meetings.files.errors.type'))
      return
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      toast.error(t('meetings.files.errors.tooLarge'))
      return
    }
    try {
      await upload.mutateAsync({ meetingId, file })
      toast.success(t('meetings.files.uploaded'))
    } catch (error) {
      const apiError = toApiClientError(error)
      toast.error(t(`meetings.errors.${apiError.code}`, { defaultValue: t('meetings.files.errors.upload') }))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeFile() {
    if (!removeTarget) return
    try {
      await remove.mutateAsync({ meetingId, attachmentId: removeTarget.id })
      toast.success(t('meetings.files.removed'))
      setRemoveTarget(null)
    } catch {
      toast.error(t('meetings.files.errors.remove'))
    }
  }

  if (query.isPending) return <LoadingState className="min-h-32" />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  const files = query.data ?? []

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('meetings.files.title')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('meetings.files.description')}</p>
        </div>
        {canManage && files.length < 10 ? (
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            {t('meetings.files.add')}
          </Button>
        ) : null}
      </div>
      <input ref={fileRef} type="file" className="hidden" accept={allowedExtensions.join(',')} onChange={(event) => void choose(event.target.files?.item(0) ?? null)} />

      {files.length === 0 ? (
        <EmptyState icon={Paperclip} title={t('meetings.files.emptyTitle')} description={t('meetings.files.emptyDescription')} className="mt-4 min-h-36" />
      ) : (
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><FileText className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.originalFileName}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{formatBytes(file.sizeBytes)} · {file.uploadedBy.userName}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label={t('meetings.files.preview')} onClick={() => setPreview(file)}><Eye className="size-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={t('meetings.files.download')} onClick={() => void downloadMeetingAttachment(file).catch(() => toast.error(t('meetings.files.errors.download')))}><Download className="size-4" /></Button>
              {canManage ? <Button variant="ghost" size="icon" aria-label={t('meetings.files.remove')} onClick={() => setRemoveTarget(file)}><Trash2 className="text-destructive size-4" /></Button> : null}
            </div>
          ))}
        </div>
      )}

      <MeetingAttachmentPreviewDialog attachment={preview} open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null) }} />
      <ConfirmModal open={removeTarget !== null} title={t('meetings.files.removeTitle')} message={t('meetings.files.removeDescription', { name: removeTarget?.originalFileName ?? '' })} confirmText={t('meetings.files.remove')} cancelText={t('common.cancel')} danger loading={remove.isPending} onConfirm={() => void removeFile()} onCancel={() => setRemoveTarget(null)} />
    </Card>
  )
}
