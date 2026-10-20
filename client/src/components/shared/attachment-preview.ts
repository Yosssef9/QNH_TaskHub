// Supported inline types are deliberately limited to non-executable formats.
// Do not trust a user-controlled MIME type on its own (for example, image/svg+xml).
export type AttachmentPreviewKind = 'image' | 'pdf' | 'text' | 'unsupported'
export interface PreviewableAttachment {
  id: string
  originalFileName: string
  mimeType?: string
  fileExtension?: string
}

export function attachmentPreviewKind(file: Pick<PreviewableAttachment, 'originalFileName' | 'fileExtension' | 'mimeType'>): AttachmentPreviewKind {
  const extension = (file.fileExtension || file.originalFileName.slice(file.originalFileName.lastIndexOf('.'))).toLowerCase()
  const mime = file.mimeType?.toLowerCase().split(';', 1)[0] ?? ''
  const generic = !mime || mime === 'application/octet-stream'
  if (extension === '.png' && (generic || mime === 'image/png')) return 'image'
  if (['.jpg', '.jpeg'].includes(extension) && (generic || mime === 'image/jpeg')) return 'image'
  if (extension === '.webp' && (generic || mime === 'image/webp')) return 'image'
  if (extension === '.pdf' && (generic || mime === 'application/pdf')) return 'pdf'
  if (extension === '.txt' && (generic || mime === 'text/plain')) return 'text'
  return 'unsupported'
}

export function safePreviewMime(file: PreviewableAttachment, kind: AttachmentPreviewKind): string {
  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'text') return 'text/plain;charset=UTF-8'
  if (kind === 'image') {
    const extension = (file.fileExtension || file.originalFileName.slice(file.originalFileName.lastIndexOf('.'))).toLowerCase()
    return extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
  }
  return 'application/octet-stream'
}
