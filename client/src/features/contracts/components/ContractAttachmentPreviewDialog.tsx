import { AttachmentPreviewDialog } from '@/components/shared/AttachmentPreviewDialog'
import { downloadContractAttachment, getContractAttachmentPreview } from '../api/contracts.api'
import type { ContractAttachment } from '../types/contracts.types'

export function ContractAttachmentPreviewDialog({ attachment, onOpenChange }: {
  attachment: ContractAttachment | null
  onOpenChange: (open: boolean) => void
}) {
  return <AttachmentPreviewDialog attachment={attachment} onOpenChange={onOpenChange}
    getPreview={getContractAttachmentPreview} download={downloadContractAttachment} />
}
