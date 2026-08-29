import { Router, type Router as ExpressRouter } from "express";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  archiveKpi,
  createKpi,
  getKpi,
  listKpis,
  reorderKpis,
  setKpiActive,
  updateKpi,
} from "./kpis.controller.js";
import {
  kpiParamsSchema,
  reorderKpisBodySchema,
  saveKpiBodySchema,
  updateKpiActiveBodySchema,
} from "./kpis.schemas.js";

export const kpisRouter: ExpressRouter = Router();

kpisRouter.use(verifyPortalJwt, resolveTaskHubAccess);

kpisRouter.get("/", listKpis);
kpisRouter.post("/", validateRequest({ body: saveKpiBodySchema }), createKpi);
kpisRouter.put("/reorder", validateRequest({ body: reorderKpisBodySchema }), reorderKpis);

kpisRouter.get("/:kpiId", validateRequest({ params: kpiParamsSchema }), getKpi);

kpisRouter.put(
  "/:kpiId",
  validateRequest({ params: kpiParamsSchema, body: saveKpiBodySchema }),
  updateKpi,
);

kpisRouter.patch(
  "/:kpiId/active",
  validateRequest({ params: kpiParamsSchema, body: updateKpiActiveBodySchema }),
  setKpiActive,
);

kpisRouter.delete("/:kpiId", validateRequest({ params: kpiParamsSchema }), archiveKpi);
