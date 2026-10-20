import { AppError } from '../../shared/errors/app-error.js';

/** Treat stored MIME metadata as untrusted; preview only known safe file signatures. */
export function collaborationPreviewMime(name: string, buffer: Buffer): string {
  const filename = name.toLowerCase();
  let mime: string | undefined;
  let valid = false;
  if (filename.endsWith('.png')) {
    mime = 'image/png';
    valid = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    mime = 'image/jpeg';
    valid = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  } else if (filename.endsWith('.webp')) {
    mime = 'image/webp';
    valid = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  } else if (filename.endsWith('.pdf')) {
    mime = 'application/pdf';
    valid = buffer.toString('ascii', 0, 5) === '%PDF-';
  } else if (filename.endsWith('.txt')) {
    mime = 'text/plain; charset=utf-8';
    valid = true; // Always rendered as inert text, never as HTML.
  }
  if (!mime) throw new AppError({ statusCode: 415, code: 'COLLABORATION_PREVIEW_UNSUPPORTED',
    message: 'Preview is not available for this file type.' });
  if (!valid) throw new AppError({ statusCode: 415, code: 'COLLABORATION_PREVIEW_INVALID',
    message: 'Invalid preview file format.' });
  return mime;
}
