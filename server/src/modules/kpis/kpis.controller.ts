import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  KpiParams,
  ReorderKpisBody,
  SaveKpiBody,
  UpdateKpiActiveBody,
} from "./kpis.schemas.js";
import { kpisService } from "./kpis.service.js";
import type { PersonalKpi } from "./kpis.types.js";

function owner(req: Request): number {
  const id = req.authContext?.user.userId;
  if (!id)
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  return id;
}
const sendKpi = (res: Parameters<RequestHandler>[1], kpi: PersonalKpi, status = 200) => {
  const body: ApiSuccessResponse<{ kpi: PersonalKpi }> = { success: true, data: { kpi } };
  res.status(status).json(body);
};
export const listKpis: RequestHandler = async (req, res) => {
  const kpis = await kpisService.list(owner(req));
  const body: ApiSuccessResponse<{ kpis: PersonalKpi[] }> = { success: true, data: { kpis } };
  res.json(body);
};
export const getKpi: RequestHandler = async (req, res) =>
  sendKpi(
    res,
    await kpisService.get(owner(req), getValidatedRequestPart<KpiParams>(req, "params").kpiId),
  );
export const createKpi: RequestHandler = async (req, res) =>
  sendKpi(
    res,
    await kpisService.create(owner(req), getValidatedRequestPart<SaveKpiBody>(req, "body")),
    201,
  );
export const updateKpi: RequestHandler = async (req, res) =>
  sendKpi(
    res,
    await kpisService.update(
      owner(req),
      getValidatedRequestPart<KpiParams>(req, "params").kpiId,
      getValidatedRequestPart<SaveKpiBody>(req, "body"),
    ),
  );
export const setKpiActive: RequestHandler = async (req, res) =>
  sendKpi(
    res,
    await kpisService.setActive(
      owner(req),
      getValidatedRequestPart<KpiParams>(req, "params").kpiId,
      getValidatedRequestPart<UpdateKpiActiveBody>(req, "body").isActive,
    ),
  );
export const reorderKpis: RequestHandler = async (req, res) => {
  const kpis = await kpisService.reorder(
    owner(req),
    getValidatedRequestPart<ReorderKpisBody>(req, "body").kpiIds,
  );
  const body: ApiSuccessResponse<{ kpis: PersonalKpi[] }> = { success: true, data: { kpis } };
  res.json(body);
};
export const archiveKpi: RequestHandler = async (req, res) => {
  await kpisService.archive(owner(req), getValidatedRequestPart<KpiParams>(req, "params").kpiId);
  res.status(204).send();
};
