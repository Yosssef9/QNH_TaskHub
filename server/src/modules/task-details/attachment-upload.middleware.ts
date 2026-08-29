import path from "node:path";

import multer from "multer";
import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
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
  limits: { files: 1, fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.has(extension)) {
      callback(null, true);
      return;
    }
    callback(
      new AppError({
        statusCode: 400,
        code: "ATTACHMENT_TYPE_NOT_ALLOWED",
        message: "This attachment type is not allowed.",
      }),
    );
  },
}).single("file");

export const uploadSingleAttachment: RequestHandler = (req, res, next) => {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      next(
        new AppError({
          statusCode: error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
          code:
            error.code === "LIMIT_FILE_SIZE" ? "ATTACHMENT_TOO_LARGE" : "ATTACHMENT_UPLOAD_INVALID",
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Attachment must not exceed 10 MB."
              : "Invalid attachment upload.",
        }),
      );
      return;
    }
    next(error);
  });
};
