import { Router, type Router as ExpressRouter } from "express";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { createKpiTask, getKpiSummary, getKpiTaskDeadline, listKpiTasks, saveKpiMeasurement } from "./kpi-work.controller.js";
import { createKpiTaskBodySchema, kpiPeriodQuerySchema, kpiTaskDeadlineQuerySchema, kpiTaskListQuerySchema, kpiWorkParamsSchema, saveManualMeasurementBodySchema } from "./kpi-work.schemas.js";

export const kpiInstancesRouter: ExpressRouter = Router();
kpiInstancesRouter.use(verifyPortalJwt, resolveTaskHubAccess);
kpiInstancesRouter.get("/:instanceId/tasks", validateRequest({ params: kpiWorkParamsSchema, query: kpiTaskListQuerySchema }), listKpiTasks);
kpiInstancesRouter.post("/:instanceId/tasks", validateRequest({ params: kpiWorkParamsSchema, body: createKpiTaskBodySchema }), createKpiTask);
kpiInstancesRouter.get("/:instanceId/task-deadline", validateRequest({ params: kpiWorkParamsSchema, query: kpiTaskDeadlineQuerySchema }), getKpiTaskDeadline);
kpiInstancesRouter.get("/:instanceId/summary", validateRequest({ params: kpiWorkParamsSchema, query: kpiPeriodQuerySchema }), getKpiSummary);
kpiInstancesRouter.put("/:instanceId/measurement", validateRequest({ params: kpiWorkParamsSchema, body: saveManualMeasurementBodySchema }), saveKpiMeasurement);
