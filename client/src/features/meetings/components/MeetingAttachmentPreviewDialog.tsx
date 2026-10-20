import { AttachmentPreviewDialog } from '@/components/shared/AttachmentPreviewDialog'
import { downloadMeetingAttachment, getMeetingAttachmentPreview } from '../api/meetings.api'
import type { MeetingAttachment } from '../types/meeting.types'

export function MeetingAttachmentPreviewDialog({ attachment, open, onOpenChange }: {
  attachment: MeetingAttachment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return <AttachmentPreviewDialog attachment={open ? attachment : null} onOpenChange={onOpenChange}
    getPreview={getMeetingAttachmentPreview} download={downloadMeetingAttachment} />
}
