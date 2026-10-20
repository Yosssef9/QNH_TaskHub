import { describe, expect, it } from 'vitest';
import { collaborationPreviewMime } from '../../src/modules/collaboration/collaboration-preview.js';

const pdf = Buffer.from('%PDF-1.7\n');
const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
const jpg = Buffer.from([255,216,255,0]);
const webp = Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP')]);

describe('collaboration preview MIME security', () => {
  it('allows supported real files and forces safe content types', () => {
    expect(collaborationPreviewMime('تقرير.pdf',pdf)).toBe('application/pdf');
    expect(collaborationPreviewMime('صورة.png',png)).toBe('image/png');
    expect(collaborationPreviewMime('photo.JPG',jpg)).toBe('image/jpeg');
    expect(collaborationPreviewMime('example.webp',webp)).toBe('image/webp');
    expect(collaborationPreviewMime('notes.txt',Buffer.from('<script>text only</script>'))).toContain('text/plain');
  });
  it('rejects HTML masquerading as PDFs/images and unsafe file extensions', () => {
    for (const name of ['fake.png','fake.pdf','fake.jpg','fake.webp']) {
      expect(() => collaborationPreviewMime(name,Buffer.from('<html>'))).toThrow();
    }
    for (const name of ['unsafe.svg','report.docx','book.xlsx','fake.html']) {
      expect(() => collaborationPreviewMime(name,pdf)).toThrow();
    }
  });
});
