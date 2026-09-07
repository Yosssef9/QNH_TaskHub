import { Router, type Router as ExpressRouter } from "express";

import { validateRequest } from "../../middleware/validate.middleware.js";
import {
  applyProcurementImport,
  previewProcurementImport,
} from "./procurement-imports.controller.js";
import {
  procurementImportApplyBodySchema,
  procurementImportPreviewQuerySchema,
} from "./procurement-imports.schemas.js";
import { uploadSingleProcurementImport } from "./procurement-imports-upload.middleware.js";

export const procurementImportsRouter: ExpressRouter = Router();

procurementImportsRouter.post(
  "/preview",
  uploadSingleProcurementImport,
  validateRequest({ query: procurementImportPreviewQuerySchema }),
  previewProcurementImport,
);

procurementImportsRouter.post(
  "/apply",
  uploadSingleProcurementImport,
  validateRequest({ body: procurementImportApplyBodySchema }),
  applyProcurementImport,
);
