import { AttachmentPreviewDialog as SharedAttachmentPreviewDialog } from '@/components/shared/AttachmentPreviewDialog'
import { downloadAttachment, getAttachmentPreview } from '../api/tasks.api'
import type { TaskAttachment } from '../types/task.types'

export function AttachmentPreviewDialog({ attachment, onOpenChange }: {
  attachment: TaskAttachment | null
  onOpenChange: (open: boolean) => void
}) {
  return <SharedAttachmentPreviewDialog attachment={attachment} onOpenChange={onOpenChange}
    getPreview={getAttachmentPreview} download={downloadAttachment} />
}
