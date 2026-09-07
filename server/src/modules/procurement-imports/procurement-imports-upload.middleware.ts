import path from "node:path";

import type { RequestHandler } from "express";
import multer from "multer";

import { AppError } from "../../shared/errors/app-error.js";

export const MAX_PROCUREMENT_IMPORT_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_PROCUREMENT_IMPORT_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === ".xlsx") {
      callback(null, true);
      return;
    }

    callback(
      new AppError({
        statusCode: 400,
        code: "PROCUREMENT_IMPORT_FILE_TYPE_NOT_ALLOWED",
        message: "Procurement imports must use an .xlsx Excel workbook.",
      }),
    );
  },
}).single("file");

export const uploadSingleProcurementImport: RequestHandler = (req, res, next) => {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      next(
        new AppError({
          statusCode: error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
          code: error.code === "LIMIT_FILE_SIZE"
            ? "PROCUREMENT_IMPORT_FILE_TOO_LARGE"
            : "PROCUREMENT_IMPORT_UPLOAD_INVALID",
          message: error.code === "LIMIT_FILE_SIZE"
            ? "Procurement Excel imports must not exceed 5 MB."
            : "Invalid Procurement Excel upload.",
        }),
      );
      return;
    }

    next(error);
  });
};
