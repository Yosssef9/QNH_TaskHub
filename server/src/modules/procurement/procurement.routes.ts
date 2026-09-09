import { Router, type Router as ExpressRouter } from "express";

import {
  requireAnyProcurementAccess,
  requireProcurementEntityAccess,
} from "../../middleware/requireAccessPermission.middleware.js";
import { requireRole } from "../../middleware/requireRole.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { procurementImportsRouter } from "../procurement-imports/procurement-imports.routes.js";
import { procurementSavedViewsRouter } from "../procurement-saved-views/procurement-saved-views.routes.js";
import {
  getProcurementSyncStatus,
  syncProcurement,
} from "./procurement.controller.js";

export const procurementRouter: ExpressRouter = Router();

procurementRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireAnyProcurementAccess);

procurementRouter.get("/sync-status", getProcurementSyncStatus);
procurementRouter.post("/sync", requireRole("ADMIN"), syncProcurement);

procurementRouter.use(
  "/imports",
  requireProcurementEntityAccess("ITEMS"),
  requireProcurementEntityAccess("PRICE_QUOTES"),
  procurementImportsRouter,
);
procurementRouter.use(
  "/saved-views",
  requireProcurementEntityAccess("ITEMS"),
  procurementSavedViewsRouter,
);
