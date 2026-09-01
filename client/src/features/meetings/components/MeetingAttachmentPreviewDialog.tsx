import { Download, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { downloadMeetingAttachment, getMeetingAttachmentPreview } from '../api/meetings.api'
import type { MeetingAttachment } from '../types/meeting.types'

export function MeetingAttachmentPreviewDialog({ attachment, open, onOpenChange }: {
  attachment: MeetingAttachment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || !attachment) return
    const controller = new AbortController()
    let created: string | null = null
    setFailed(false)
    setUrl(null)
    void getMeetingAttachmentPreview(attachment.id, controller.signal)
      .then((blob) => {
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => setFailed(true))
    return () => {
      controller.abort()
      if (created) URL.revokeObjectURL(created)
    }
  }, [attachment, open])

  const isImage = attachment?.mimeType.startsWith('image/') === true
  const isPdf = attachment?.mimeType === 'application/pdf'

  async function download() {
    if (!attachment) return
    try {
      await downloadMeetingAttachment(attachment)
    } catch {
      toast.error(t('meetings.files.errors.download'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" className="w-[min(64rem,calc(100vw-2rem))] p-0">
        <div className="border-b px-6 py-4 pe-12">
          <DialogTitle>{attachment?.originalFileName ?? t('meetings.files.preview')}</DialogTitle>
          <DialogDescription>{t('meetings.files.previewDescription')}</DialogDescription>
        </div>
        <div className="grid min-h-72 place-items-center p-6">
          {failed ? (
            <p className="text-destructive text-sm">{t('meetings.files.errors.preview')}</p>
          ) : !url ? (
            <p className="text-muted-foreground text-sm">{t('meetings.files.loading')}</p>
          ) : isImage ? (
            <img src={url} alt={attachment?.originalFileName ?? ''} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={attachment?.originalFileName} className="h-[70vh] w-full rounded-lg border bg-white" />
          ) : (
            <div className="text-center">
              <FileText className="text-muted-foreground mx-auto size-14" />
              <p className="mt-3 font-medium">{t('meetings.files.previewUnavailable')}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t px-6 py-4">
          <Button variant="outline" onClick={() => void download()}>
            <Download className="size-4" aria-hidden="true" />
            {t('meetings.files.download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
