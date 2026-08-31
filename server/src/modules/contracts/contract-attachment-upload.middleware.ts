import path from "node:path";

import multer from "multer";
import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";

export const MAX_CONTRACT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_CONTRACT_ATTACHMENT_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.has(extension)) {
      callback(null, true);
      return;
    }
    callback(
      new AppError({
        statusCode: 400,
        code: "CONTRACT_ATTACHMENT_TYPE_NOT_ALLOWED",
        message: "Only PDF, JPG, JPEG, and PNG Contract files are allowed.",
      }),
    );
  },
}).single("file");

export const uploadSingleContractAttachment: RequestHandler = (req, res, next) => {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      next(
        new AppError({
          statusCode: error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
          code:
            error.code === "LIMIT_FILE_SIZE"
              ? "CONTRACT_ATTACHMENT_TOO_LARGE"
              : "CONTRACT_ATTACHMENT_UPLOAD_INVALID",
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Contract files must not exceed 10 MB."
              : "Invalid Contract file upload.",
        }),
      );
      return;
    }
    next(error);
  });
};
