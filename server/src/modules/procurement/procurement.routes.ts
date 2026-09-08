import { Router, type Router as ExpressRouter } from "express";

import { requireProcurementAccess } from "../../middleware/requireProcurementAccess.middleware.js";
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

procurementRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireProcurementAccess);

procurementRouter.get("/sync-status", getProcurementSyncStatus);
procurementRouter.post("/sync", requireRole("ADMIN"), syncProcurement);

procurementRouter.use("/imports", procurementImportsRouter);
procurementRouter.use("/saved-views", procurementSavedViewsRouter);
