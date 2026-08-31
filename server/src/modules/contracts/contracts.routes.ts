import { Router, type Router as ExpressRouter } from "express";

import { requireContractsAccess } from "../../middleware/requireContractsAccess.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { uploadSingleContractAttachment } from "./contract-attachment-upload.middleware.js";
import {
  archiveContract,
  archiveSupplier,
  createContract,
  downloadContractAttachment,
  createSupplier,
  getContract,
  getContractSettings,
  getSupplier,
  listContractAttachments,
  listContractActivity,
  listContracts,
  listSuppliers,
  previewContractAttachment,
  removeContractAttachment,
  restoreContract,
  restoreSupplier,
  updateContract,
  updateContractSettings,
  updateSupplier,
  uploadContractAttachment,
} from "./contracts.controller.js";
import {
  attachmentIdParamsSchema,
  contractIdParamsSchema,
  contractListQuerySchema,
  contractSettingsBodySchema,
  createContractBodySchema,
  createSupplierBodySchema,
  rowVersionBodySchema,
  supplierIdParamsSchema,
  supplierListQuerySchema,
  updateContractBodySchema,
  updateSupplierBodySchema,
} from "./contracts.schemas.js";

export const contractsRouter: ExpressRouter = Router();

contractsRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireContractsAccess);

contractsRouter.get("/", validateRequest({ query: contractListQuerySchema }), listContracts);
contractsRouter.post("/", validateRequest({ body: createContractBodySchema }), createContract);
contractsRouter.get("/settings", getContractSettings);
contractsRouter.patch(
  "/settings",
  validateRequest({ body: contractSettingsBodySchema }),
  updateContractSettings,
);

contractsRouter.get("/suppliers", validateRequest({ query: supplierListQuerySchema }), listSuppliers);
contractsRouter.post("/suppliers", validateRequest({ body: createSupplierBodySchema }), createSupplier);
contractsRouter.get(
  "/suppliers/:supplierId",
  validateRequest({ params: supplierIdParamsSchema }),
  getSupplier,
);
contractsRouter.patch(
  "/suppliers/:supplierId",
  validateRequest({ params: supplierIdParamsSchema, body: updateSupplierBodySchema }),
  updateSupplier,
);
contractsRouter.post(
  "/suppliers/:supplierId/archive",
  validateRequest({ params: supplierIdParamsSchema, body: rowVersionBodySchema }),
  archiveSupplier,
);
contractsRouter.post(
  "/suppliers/:supplierId/restore",
  validateRequest({ params: supplierIdParamsSchema, body: rowVersionBodySchema }),
  restoreSupplier,
);

contractsRouter.get(
  "/:contractId/attachments",
  validateRequest({ params: contractIdParamsSchema }),
  listContractAttachments,
);
contractsRouter.post(
  "/:contractId/attachments",
  validateRequest({ params: contractIdParamsSchema }),
  uploadSingleContractAttachment,
  uploadContractAttachment,
);
contractsRouter.get(
  "/attachments/:attachmentId/preview",
  validateRequest({ params: attachmentIdParamsSchema }),
  previewContractAttachment,
);
contractsRouter.get(
  "/attachments/:attachmentId/download",
  validateRequest({ params: attachmentIdParamsSchema }),
  downloadContractAttachment,
);
contractsRouter.delete(
  "/attachments/:attachmentId",
  validateRequest({ params: attachmentIdParamsSchema }),
  removeContractAttachment,
);

contractsRouter.get(
  "/:contractId",
  validateRequest({ params: contractIdParamsSchema }),
  getContract,
);
contractsRouter.patch(
  "/:contractId",
  validateRequest({ params: contractIdParamsSchema, body: updateContractBodySchema }),
  updateContract,
);
contractsRouter.post(
  "/:contractId/archive",
  validateRequest({ params: contractIdParamsSchema, body: rowVersionBodySchema }),
  archiveContract,
);
contractsRouter.post(
  "/:contractId/restore",
  validateRequest({ params: contractIdParamsSchema, body: rowVersionBodySchema }),
  restoreContract,
);
contractsRouter.get(
  "/:contractId/activity",
  validateRequest({ params: contractIdParamsSchema }),
  listContractActivity,
);
