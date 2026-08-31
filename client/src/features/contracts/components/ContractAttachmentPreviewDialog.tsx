import { Download, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

import {
  downloadContractAttachment,
  getContractAttachmentPreview,
} from '../api/contracts.api'
import type { ContractAttachment } from '../types/contracts.types'

interface Props {
  attachment: ContractAttachment | null
  onOpenChange: (open: boolean) => void
}

type PreviewKind = 'image' | 'pdf' | 'unsupported'

function previewKind(attachment: ContractAttachment): PreviewKind {
  const extension = attachment.fileExtension.toLowerCase()
  if (attachment.mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg'].includes(extension))
    return 'image'
  if (attachment.mimeType === 'application/pdf' || extension === '.pdf') return 'pdf'
  return 'unsupported'
}

export function ContractAttachmentPreviewDialog({ attachment, onOpenChange }: Props) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<
    | { status: 'loading' }
    | { status: 'failed' }
    | { status: 'ready'; url: string }
  >({ status: 'loading' })
  const kind = attachment ? previewKind(attachment) : 'unsupported'

  useEffect(() => {
    if (!attachment || kind === 'unsupported') return
    const controller = new AbortController()
    let objectUrl: string | null = null
    setPreview({ status: 'loading' })
    void getContractAttachmentPreview(attachment.id, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setPreview({ status: 'ready', url: objectUrl })
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
      await downloadContractAttachment(attachment)
    } catch {
      toast.error(t('contracts.files.errors.download'))
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
            {t('contracts.files.previewDescription')}
          </DialogDescription>
        </header>

        <div className="bg-muted/35 grid min-h-[28rem] place-items-center overflow-auto p-4 sm:min-h-[36rem]">
          {kind !== 'unsupported' && preview.status === 'loading' ? (
            <LoadingState />
          ) : preview.status === 'failed' ? (
            <p className="text-destructive text-sm">{t('contracts.files.errors.preview')}</p>
          ) : kind === 'image' && preview.status === 'ready' ? (
            <img
              src={preview.url}
              alt={attachment?.originalFileName ?? ''}
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
            />
          ) : kind === 'pdf' && preview.status === 'ready' ? (
            <iframe
              src={preview.url}
              title={attachment?.originalFileName}
              className="h-[70vh] w-full rounded-lg border bg-white"
            />
          ) : (
            <div className="max-w-md text-center">
              <FileText className="text-muted-foreground mx-auto size-14" />
              <p className="mt-4 font-medium">{t('contracts.files.previewUnavailable')}</p>
            </div>
          )}
        </div>

        <footer className="flex justify-end border-t px-6 py-4">
          <Button variant="outline" onClick={() => void download()}>
            <Download aria-hidden="true" className="size-4" />
            {t('contracts.files.download')}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
