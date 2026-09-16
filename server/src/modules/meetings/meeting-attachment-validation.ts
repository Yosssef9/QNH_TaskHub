import path from "node:path";

import { AppError } from "../../shared/errors/app-error.js";

export function cleanMeetingAttachmentFileName(rawName: string): string {
  const value = Array.from(path.basename(rawName))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 260);
  if (!value) {
    throw new AppError({
      statusCode: 400,
      code: "MEETING_ATTACHMENT_NAME_INVALID",
      message: "Meeting attachment file name is invalid.",
    });
  }
  return value;
}

export function meetingAttachmentMimeType(extension: string): string {
  const values: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return values[extension] ?? "application/octet-stream";
}

export function meetingAttachmentSignatureMatches(extension: string, buffer: Buffer): boolean {
  if (extension === ".txt") return !buffer.includes(0);
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => buffer[index] === value);
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === ".webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if ([".docx", ".xlsx", ".pptx"].includes(extension)) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  if ([".doc", ".xls", ".ppt"].includes(extension)) {
    const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return ole.every((value, index) => buffer[index] === value);
  }
  return false;
}

export function validateMeetingAttachmentFile(file: Express.Multer.File): {
  originalFileName: string;
  extension: string;
  mimeType: string;
} {
  if (file.size <= 0 || file.buffer.length <= 0) {
    throw new AppError({
      statusCode: 400,
      code: "MEETING_ATTACHMENT_EMPTY",
      message: "Meeting attachment must not be empty.",
    });
  }
  const originalFileName = cleanMeetingAttachmentFileName(file.originalname);
  const extension = path.extname(originalFileName).toLowerCase();
  if (!meetingAttachmentSignatureMatches(extension, file.buffer)) {
    throw new AppError({
      statusCode: 400,
      code: "MEETING_ATTACHMENT_SIGNATURE_INVALID",
      message: "Meeting attachment content does not match its file type.",
    });
  }
  return { originalFileName, extension, mimeType: meetingAttachmentMimeType(extension) };
}
