import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  ProcurementImportApplyBody,
  ProcurementImportPreviewQuery,
} from "./procurement-imports.schemas.js";
import { procurementImportsService } from "./procurement-imports.service.js";
import type {
  ProcurementImportApplyResult,
  ProcurementImportPreview,
} from "./procurement-imports.types.js";

function owner(req: Request): number {
  const value = req.authContext?.user.userId;
  if (!value) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return value;
}

function uploadedFile(req: Request): Express.Multer.File {
  if (!req.file) {
    throw new AppError({
      statusCode: 400,
      code: "PROCUREMENT_IMPORT_FILE_REQUIRED",
      message: "Select an .xlsx Excel workbook.",
    });
  }
  return req.file;
}

export const previewProcurementImport: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<ProcurementImportPreviewQuery>(req, "query");
  const data = await procurementImportsService.preview(owner(req), uploadedFile(req), query.sheetName);
  const body: ApiSuccessResponse<ProcurementImportPreview> = { success: true, data };
  res.status(200).json(body);
};

export const applyProcurementImport: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<ProcurementImportApplyBody>(req, "body");
  const data = await procurementImportsService.apply(owner(req), uploadedFile(req), {
    targetMode: input.targetMode,
    ...(input.sheetName ? { sheetName: input.sheetName } : {}),
    ...(input.targetSavedViewId !== undefined ? { targetSavedViewId: input.targetSavedViewId } : {}),
    ...(input.newViewName ? { newViewName: input.newViewName } : {}),
  });
  const body: ApiSuccessResponse<ProcurementImportApplyResult> = { success: true, data };
  res.status(201).json(body);
};
