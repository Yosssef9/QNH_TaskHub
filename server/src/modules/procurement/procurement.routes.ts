import { Router, type Router as ExpressRouter } from "express";
import { requireProcurementAccess } from "../../middleware/requireProcurementAccess.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { procurementSavedViewsRouter } from "../procurement-saved-views/procurement-saved-views.routes.js";
import { syncProcurement } from "./procurement.controller.js";

export const procurementRouter: ExpressRouter = Router();
procurementRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireProcurementAccess);
procurementRouter.post("/sync", syncProcurement);
procurementRouter.use("/saved-views", procurementSavedViewsRouter);
