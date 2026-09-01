import path from "node:path";

import multer from "multer";
import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";

export const MAX_MEETING_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_MEETING_ATTACHMENTS = 10;

const allowedExtensions = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_MEETING_ATTACHMENT_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.has(extension)) {
      callback(null, true);
      return;
    }
    callback(
      new AppError({
        statusCode: 400,
        code: "MEETING_ATTACHMENT_TYPE_NOT_ALLOWED",
        message: "This Meeting attachment type is not allowed.",
      }),
    );
  },
}).single("file");

export const uploadSingleMeetingAttachment: RequestHandler = (req, res, next) => {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      next(
        new AppError({
          statusCode: error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
          code:
            error.code === "LIMIT_FILE_SIZE"
              ? "MEETING_ATTACHMENT_TOO_LARGE"
              : "MEETING_ATTACHMENT_UPLOAD_INVALID",
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Meeting attachments must not exceed 10 MB."
              : "Invalid Meeting attachment upload.",
        }),
      );
      return;
    }
    next(error);
  });
};
