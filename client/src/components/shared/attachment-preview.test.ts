import { describe, expect, it } from 'vitest'
import { attachmentPreviewKind, safePreviewMime } from './attachment-preview'

describe('shared attachment preview policy', () => {
  it('supports only common safe inline types', () => {
    for (const [name,kind] of [['صورة.png','image'],['photo.jpeg','image'],['photo.webp','image'],['Report.PDF','pdf'],['notes.txt','text']] as const) {
      expect(attachmentPreviewKind({ originalFileName:name })).toBe(kind)
    }
  })
  it('rejects executable or unsupported content despite misleading mime metadata', () => {
    expect(attachmentPreviewKind({originalFileName:'unsafe.svg',mimeType:'image/svg+xml'})).toBe('unsupported')
    expect(attachmentPreviewKind({originalFileName:'fake.html',mimeType:'application/pdf'})).toBe('unsupported')
    expect(attachmentPreviewKind({originalFileName:'word.docx'})).toBe('unsupported')
    expect(attachmentPreviewKind({originalFileName:'fake.png',mimeType:'text/html'})).toBe('unsupported')
    expect(attachmentPreviewKind({originalFileName:'old.pdf',mimeType:'application/octet-stream'})).toBe('pdf')
  })
  it('forces a safe blob MIME type for supported formats', () => {
    const file={id:'1',originalFileName:'doc.pdf'}
    expect(safePreviewMime(file,attachmentPreviewKind(file))).toBe('application/pdf')
  })
})
