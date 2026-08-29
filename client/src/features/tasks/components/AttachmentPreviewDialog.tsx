import { Download, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

import { downloadAttachment, getAttachmentPreview } from '../api/tasks.api'
import type { TaskAttachment } from '../types/task.types'

interface Props {
  attachment: TaskAttachment | null
  onOpenChange: (open: boolean) => void
}

type PreviewKind = 'image' | 'pdf' | 'text' | 'unsupported'

function previewKind(attachment: TaskAttachment): PreviewKind {
  const extension = attachment.fileExtension.toLowerCase()
  if (
    attachment.mimeType.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.webp'].includes(extension)
  )
    return 'image'
  if (attachment.mimeType === 'application/pdf' || extension === '.pdf') return 'pdf'
  if (attachment.mimeType.startsWith('text/') || extension === '.txt') return 'text'
  return 'unsupported'
}

export function AttachmentPreviewDialog({ attachment, onOpenChange }: Props) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<
    | { status: 'loading' }
    | { status: 'failed' }
    | { status: 'ready'; url: string; text: null }
    | { status: 'ready'; url: null; text: string }
  >({ status: 'loading' })
  const kind = attachment ? previewKind(attachment) : 'unsupported'

  useEffect(() => {
    if (!attachment || kind === 'unsupported') return
    const controller = new AbortController()
    let objectUrl: string | null = null
    void getAttachmentPreview(attachment.id, controller.signal)
      .then(async (blob) => {
        if (kind === 'text') setPreview({ status: 'ready', url: null, text: await blob.text() })
        else {
          objectUrl = URL.createObjectURL(blob)
          setPreview({ status: 'ready', url: objectUrl, text: null })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ status: 'failed' })
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment, kind])

  async function download() {
    if (!attachment) return
    try {
      await downloadAttachment(attachment)
    } catch {
      toast.error(t('tasks.details.errors.download'))
    }
  }

  return (
    <Dialog open={attachment !== null} onOpenChange={onOpenChange}>
      <DialogContent
        variant="modal"
        className="max-h-[94vh] w-[min(72rem,calc(100vw-2rem))] max-w-none p-0"
        closeLabel={t('common.close')}
      >
        <header className="border-b px-6 py-4 pe-14">
          <DialogTitle className="truncate text-lg">{attachment?.originalFileName}</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            {t('tasks.details.previewDescription')}
          </DialogDescription>
        </header>
        <div className="bg-muted/35 grid min-h-[28rem] place-items-center overflow-auto p-4 sm:min-h-[36rem]">
          {kind !== 'unsupported' && preview.status === 'loading' ? (
            <LoadingState />
          ) : preview.status === 'failed' ? (
            <p className="text-destructive text-sm">{t('tasks.details.errors.preview')}</p>
          ) : kind === 'image' && preview.status === 'ready' && preview.url ? (
            <img
              src={preview.url}
              alt={attachment?.originalFileName ?? ''}
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
            />
          ) : kind === 'pdf' && preview.status === 'ready' && preview.url ? (
            <iframe
              src={preview.url}
              title={attachment?.originalFileName}
              className="h-[70vh] w-full rounded-lg border bg-white"
            />
          ) : kind === 'text' && preview.status === 'ready' && preview.text !== null ? (
            <pre className="bg-background text-foreground h-[65vh] w-full overflow-auto rounded-lg border p-5 text-start text-sm whitespace-pre-wrap">
              {preview.text}
            </pre>
          ) : (
            <div className="max-w-md text-center">
              <FileText className="text-muted-foreground mx-auto size-14" />
              <p className="mt-4 font-medium">{t('tasks.details.previewUnavailable')}</p>
              <p className="text-muted-foreground mt-2 text-sm">
                {t('tasks.details.previewUnavailableDescription')}
              </p>
            </div>
          )}
        </div>
        <footer className="flex justify-end border-t px-6 py-4">
          <Button variant="outline" onClick={() => void download()}>
            <Download className="size-4" />
            {t('tasks.details.downloadFile')}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
