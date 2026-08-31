import { Download, Eye, FileImage, FileText, Paperclip, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDateTime } from '@/lib/date-time'

import {
  downloadContractAttachment,
  useContractAttachments,
  useRemoveContractAttachment,
} from '../hooks/use-contracts'
import type { Contract, ContractAttachment } from '../types/contracts.types'
import { ContractAttachmentPreviewDialog } from './ContractAttachmentPreviewDialog'
import { ContractFileUploadDialog } from './ContractFileUploadDialog'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ContractFilesPanel({ contract }: { contract: Contract }) {
  const { i18n, t } = useTranslation()
  const query = useContractAttachments(contract.id)
  const removeMutation = useRemoveContractAttachment()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [preview, setPreview] = useState<ContractAttachment | null>(null)
  const [removeTarget, setRemoveTarget] = useState<ContractAttachment | null>(null)

  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />

  const attachments = query.data ?? []
  const limitReached = attachments.length >= 10

  async function download(attachment: ContractAttachment) {
    try {
      await downloadContractAttachment(attachment)
    } catch {
      toast.error(t('contracts.files.errors.download'))
    }
  }

  async function remove() {
    if (!removeTarget) return
    try {
      await removeMutation.mutateAsync({
        contractId: contract.id,
        attachmentId: removeTarget.id,
      })
      toast.success(t('contracts.files.removed'))
      setRemoveTarget(null)
    } catch {
      toast.error(t('contracts.files.errors.remove'))
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('contracts.files.title')}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('contracts.files.count', { count: attachments.length })}
            </p>
          </div>
          {contract.isActive ? (
            <Button
              onClick={() => setUploadOpen(true)}
              disabled={limitReached}
              title={limitReached ? t('contracts.files.errors.limit') : undefined}
            >
              <Plus aria-hidden="true" className="size-4" />
              {t('contracts.files.add')}
            </Button>
          ) : null}
        </div>

        {limitReached ? (
          <div className="bg-muted/50 rounded-xl border p-3 text-sm">
            {t('contracts.files.limitReached')}
          </div>
        ) : null}

        {attachments.length === 0 ? (
          <EmptyState
            icon={Paperclip}
            title={t('contracts.files.emptyTitle')}
            description={t('contracts.files.emptyDescription')}
            action={
              contract.isActive ? (
                <Button onClick={() => setUploadOpen(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  {t('contracts.files.add')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {attachments.map((attachment) => {
              const image = attachment.mimeType.startsWith('image/')
              const Icon = image ? FileImage : FileText
              return (
                <Card key={attachment.id} className="p-0">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <span className="bg-primary/8 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{attachment.originalFileName}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {attachment.fileExtension.slice(1).toUpperCase()} · {formatBytes(attachment.sizeBytes)} ·{' '}
                        {formatDateTime(attachment.createdAtUtc, i18n.language)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPreview(attachment)}>
                        <Eye aria-hidden="true" className="size-4" />
                        {t('contracts.files.preview')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void download(attachment)}>
                        <Download aria-hidden="true" className="size-4" />
                        {t('contracts.files.download')}
                      </Button>
                      {contract.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setRemoveTarget(attachment)}
                          aria-label={t('contracts.files.remove')}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <ContractFileUploadDialog
        open={uploadOpen}
        contractId={contract.id}
        existingNames={attachments.map((item) => item.originalFileName)}
        onOpenChange={setUploadOpen}
      />

      <ContractAttachmentPreviewDialog
        attachment={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      />

      <ConfirmModal
        open={removeTarget !== null}
        title={t('contracts.files.removeTitle')}
        message={t('contracts.files.removeDescription', {
          name: removeTarget?.originalFileName ?? '',
        })}
        confirmText={t('contracts.files.remove')}
        cancelText={t('contracts.files.keep')}
        danger
        loading={removeMutation.isPending}
        onConfirm={() => void remove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  )
}
