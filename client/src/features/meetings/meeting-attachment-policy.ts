export const MEETING_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
] as const

export const MEETING_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const MEETING_ATTACHMENT_MAX_COUNT = 10

function extension(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

export type MeetingAttachmentValidationError = 'TYPE' | 'SIZE'

export function validateMeetingAttachmentFile(file: File): MeetingAttachmentValidationError | null {
  if (!MEETING_ATTACHMENT_EXTENSIONS.includes(extension(file.name) as (typeof MEETING_ATTACHMENT_EXTENSIONS)[number])) {
    return 'TYPE'
  }

  if (file.size <= 0 || file.size > MEETING_ATTACHMENT_MAX_BYTES) {
    return 'SIZE'
  }

  return null
}

export function formatMeetingAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
