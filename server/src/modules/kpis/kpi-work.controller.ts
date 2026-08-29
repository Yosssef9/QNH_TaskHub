import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type {
  CreateKpiTaskBody,
  CreateGlobalKpiTaskBody,
  GlobalKpiTaskListQuery,
  KpiPeriodQuery,
  KpiTaskDeadlineQuery,
  KpiTaskListQuery,
  KpiWorkParams,
  SaveManualMeasurementBody,
} from "./kpi-work.schemas.js";
import { kpiWorkService } from "./kpi-work.service.js";

function owner(req: Request) {
  const id = req.authContext?.user.userId;

  if (!id) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  }

  return id;
}

export const listKpiTasks: RequestHandler = async (req, res) =>
  res.json({
    success: true,
    data: await kpiWorkService.list(
      owner(req),
      getValidatedRequestPart<KpiWorkParams>(req, "params").instanceId,
      getValidatedRequestPart<KpiTaskListQuery>(req, "query"),
    ),
  });

export const listAllKpiTasks: RequestHandler = async (req, res) =>
  res.json({
    success: true,
    data: await kpiWorkService.listAll(
      owner(req),
      getValidatedRequestPart<GlobalKpiTaskListQuery>(req, "query"),
    ),
  });

export const createGlobalKpiTask: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateGlobalKpiTaskBody>(req, "body");
  const { cycleId, kpiInstanceId, ...values } = input;
  const task = await kpiWorkService.createGlobal(owner(req), cycleId, kpiInstanceId, values);

  res.status(201).json({ success: true, data: { task } });
};

export const createKpiTask: RequestHandler = async (req, res) => {
  const task = await kpiWorkService.create(
    owner(req),
    getValidatedRequestPart<KpiWorkParams>(req, "params").instanceId,
    getValidatedRequestPart<CreateKpiTaskBody>(req, "body"),
  );

  res.status(201).json({ success: true, data: { task } });
};

export const getKpiTaskDeadline: RequestHandler = async (req, res) =>
  res.json({
    success: true,
    data: await kpiWorkService.deadline(
      owner(req),
      getValidatedRequestPart<KpiWorkParams>(req, "params").instanceId,
      getValidatedRequestPart<KpiTaskDeadlineQuery>(req, "query"),
    ),
  });

export const getKpiSummary: RequestHandler = async (req, res) =>
  res.json({
    success: true,
    data: await kpiWorkService.summary(
      owner(req),
      getValidatedRequestPart<KpiWorkParams>(req, "params").instanceId,
      getValidatedRequestPart<KpiPeriodQuery>(req, "query"),
    ),
  });

export const saveKpiMeasurement: RequestHandler = async (req, res) =>
  res.json({
    success: true,
    data: await kpiWorkService.saveManual(
      owner(req),
      getValidatedRequestPart<KpiWorkParams>(req, "params").instanceId,
      getValidatedRequestPart<SaveManualMeasurementBody>(req, "body"),
    ),
  });
