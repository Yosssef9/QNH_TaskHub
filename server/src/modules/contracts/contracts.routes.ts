import { Router, type Router as ExpressRouter } from "express";

import { requireProcurementEntityAccess } from "../../middleware/requireAccessPermission.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { uploadSingleContractAttachment } from "./contract-attachment-upload.middleware.js";
import {
  archiveContract,
  createContract,
  downloadContractAttachment,
  getContract,
  getContractSettings,
  listContractAccessScopes,
  listContractAttachments,
  listContractActivity,
  listContracts,
  previewContractAttachment,
  removeContractAttachment,
  restoreContract,
  updateContract,
  updateContractSettings,
  uploadContractAttachment,
} from "./contracts.controller.js";
import {
  attachmentIdParamsSchema,
  contractIdParamsSchema,
  contractListQuerySchema,
  contractSettingsBodySchema,
  createContractBodySchema,
  rowVersionBodySchema,
  updateContractBodySchema,
} from "./contracts.schemas.js";

export const contractsRouter: ExpressRouter = Router();

contractsRouter.use(
  verifyPortalJwt,
  resolveTaskHubAccess,
  requireProcurementEntityAccess("CONTRACTS"),
);

contractsRouter.get("/access-scopes", listContractAccessScopes);
contractsRouter.get("/", validateRequest({ query: contractListQuerySchema }), listContracts);
contractsRouter.post("/", validateRequest({ body: createContractBodySchema }), createContract);
contractsRouter.get("/settings", getContractSettings);
contractsRouter.patch(
  "/settings",
  validateRequest({ body: contractSettingsBodySchema }),
  updateContractSettings,
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

contractsRouter.get("/:contractId", validateRequest({ params: contractIdParamsSchema }), getContract);
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
