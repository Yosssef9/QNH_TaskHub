import { Download, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

import { attachmentPreviewKind, safePreviewMime, type PreviewableAttachment } from './attachment-preview'

interface Props<T extends PreviewableAttachment> {
  attachment: T | null
  onOpenChange: (open: boolean) => void
  getPreview: (id: string, signal: AbortSignal) => Promise<Blob>
  download: (attachment: T) => Promise<void>
}

type PreviewState =
  | { id: string; status: 'loading' }
  | { id: string; status: 'failed' }
  | { id: string; status: 'ready'; url: string | null; text: string | null }

/** One preview surface for task, meeting, contract and private assignment attachments. */
export function AttachmentPreviewDialog<T extends PreviewableAttachment>({ attachment, onOpenChange, getPreview, download }: Props<T>) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const id = attachment?.id ?? null
  const kind = attachment ? attachmentPreviewKind(attachment) : 'unsupported'

  useEffect(() => {
    if (!attachment || kind === 'unsupported') return
    const controller = new AbortController()
    let objectUrl: string | null = null
    setPreview({ id: attachment.id, status: 'loading' })
    void getPreview(attachment.id, controller.signal)
      .then(async blob => {
        if (controller.signal.aborted) return
        if (kind === 'text') {
          const text = await blob.text()
          if (!controller.signal.aborted) setPreview({ id: attachment.id, status: 'ready', url: null, text })
        } else {
          // Force a known-safe media type instead of rendering the uploaded MIME header.
          objectUrl = URL.createObjectURL(new Blob([blob], { type: safePreviewMime(attachment, kind) }))
          if (!controller.signal.aborted) setPreview({ id: attachment.id, status: 'ready', url: objectUrl, text: null })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ id: attachment.id, status: 'failed' })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment, id, kind, getPreview])

  const current = preview?.id === id ? preview : null
  async function onDownload() {
    if (!attachment) return
    try { await download(attachment) }
    catch { toast.error(t('attachments.downloadFailed')) }
  }

  return <Dialog open={attachment !== null} onOpenChange={onOpenChange}>
    <DialogContent variant="modal" className="max-h-[94vh] w-[min(72rem,calc(100vw-2rem))] max-w-none p-0" closeLabel={t('common.close')}>
      <header className="border-b px-6 py-4 pe-14">
        <DialogTitle className="truncate text-lg" title={attachment?.originalFileName}>{attachment?.originalFileName || t('attachments.preview')}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1">{t('attachments.previewDescription')}</DialogDescription>
      </header>
      <div className="bg-muted/35 grid min-h-[22rem] max-h-[75vh] place-items-center overflow-auto p-4 sm:min-h-[32rem]">
        {kind === 'unsupported' ? <div className="max-w-md text-center">
          <FileText className="text-muted-foreground mx-auto size-14" />
          <p className="mt-4 font-medium">{t('attachments.unavailable')}</p>
          <p className="text-muted-foreground mt-2 text-sm">{t('attachments.unavailableDescription')}</p>
        </div> : !current || current.status === 'loading' ? <LoadingState />
          : current.status === 'failed' ? <p role="alert" className="text-destructive text-sm">{t('attachments.previewFailed')}</p>
          : kind === 'image' && current.url ? <img src={current.url} alt={attachment?.originalFileName ?? ''} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
          : kind === 'pdf' && current.url ? <iframe src={current.url} title={attachment?.originalFileName} sandbox="allow-scripts allow-downloads" className="h-[70vh] w-full rounded-lg border bg-white" />
          : kind === 'text' && current.text !== null ? <pre className="bg-background text-foreground h-[65vh] w-full overflow-auto rounded-lg border p-5 text-start text-sm whitespace-pre-wrap break-words">{current.text}</pre>
          : null}
      </div>
      <footer className="flex justify-end border-t px-6 py-4">
        <Button variant="outline" onClick={() => void onDownload()}><Download aria-hidden="true" className="size-4" />{t('attachments.download')}</Button>
      </footer>
    </DialogContent>
  </Dialog>
}
