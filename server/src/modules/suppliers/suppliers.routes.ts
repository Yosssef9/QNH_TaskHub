import { Router, type Router as ExpressRouter } from "express";

import {
  requireProcurementEntityAccess,
  requireSupplierOptionsAccess,
} from "../../middleware/requireAccessPermission.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  createSupplier,
  getSupplier,
  getSupplierAnalytics,
  listSupplierActivity,
  listSupplierItems,
  listSupplierOptions,
  listSuppliers,
  updateSupplier,
} from "./suppliers.controller.js";
import {
  supplierAnalyticsQuerySchema,
  supplierItemsQuerySchema,
} from "../procurement-transactions/procurement-transactions.schemas.js";
import {
  createSupplierBodySchema,
  supplierIdParamsSchema,
  supplierListQuerySchema,
  supplierOptionsQuerySchema,
  updateSupplierBodySchema,
} from "./suppliers.schemas.js";

export const suppliersRouter: ExpressRouter = Router();

suppliersRouter.use(verifyPortalJwt, resolveTaskHubAccess);

suppliersRouter.get(
  "/options",
  requireSupplierOptionsAccess,
  validateRequest({ query: supplierOptionsQuerySchema }),
  listSupplierOptions,
);
suppliersRouter.use(requireProcurementEntityAccess("SUPPLIERS"));

suppliersRouter.get("/", validateRequest({ query: supplierListQuerySchema }), listSuppliers);
suppliersRouter.post("/", validateRequest({ body: createSupplierBodySchema }), createSupplier);
suppliersRouter.get(
  "/:supplierId/analytics",
  validateRequest({ params: supplierIdParamsSchema, query: supplierAnalyticsQuerySchema }),
  getSupplierAnalytics,
);
suppliersRouter.get(
  "/:supplierId/items",
  validateRequest({ params: supplierIdParamsSchema, query: supplierItemsQuerySchema }),
  listSupplierItems,
);
suppliersRouter.get(
  "/:supplierId/activity",
  validateRequest({ params: supplierIdParamsSchema }),
  listSupplierActivity,
);
suppliersRouter.get(
  "/:supplierId",
  validateRequest({ params: supplierIdParamsSchema }),
  getSupplier,
);
suppliersRouter.patch(
  "/:supplierId",
  validateRequest({ params: supplierIdParamsSchema, body: updateSupplierBodySchema }),
  updateSupplier,
);
