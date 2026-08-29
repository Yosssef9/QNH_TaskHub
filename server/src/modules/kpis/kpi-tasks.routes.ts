import { Router, type Router as ExpressRouter } from "express";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { createGlobalKpiTask, listAllKpiTasks } from "./kpi-work.controller.js";
import { createGlobalKpiTaskBodySchema, globalKpiTaskListQuerySchema } from "./kpi-work.schemas.js";

export const kpiTasksRouter: ExpressRouter = Router();

kpiTasksRouter.use(verifyPortalJwt, resolveTaskHubAccess);
kpiTasksRouter.get("/", validateRequest({ query: globalKpiTaskListQuerySchema }), listAllKpiTasks);
kpiTasksRouter.post(
  "/",
  validateRequest({ body: createGlobalKpiTaskBodySchema }),
  createGlobalKpiTask,
);
