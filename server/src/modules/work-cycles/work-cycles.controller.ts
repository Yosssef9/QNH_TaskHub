import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { AddCycleKpisBody, CreateCycleBody, UpdateCycleBody } from "./work-cycles.schemas.js";
import { workCyclesService } from "./work-cycles.service.js";

function owner(req: Request) {
  const id = req.authContext?.user.userId;
  if (!id) throw new AppError({ statusCode: 500, code: "AUTH_CONTEXT_MISSING", message: "Authenticated access was not resolved." });
  return id;
}
const params = (req: Request) => getValidatedRequestPart<{ cycleId: number; instanceId?: number }>(req, "params");
const sendCycle = (res: Parameters<RequestHandler>[1], cycle: Awaited<ReturnType<typeof workCyclesService.get>>, status = 200) => {
  const body: ApiSuccessResponse<{ cycle: typeof cycle }> = { success: true, data: { cycle } };
  res.status(status).json(body);
};

export const listWorkCycles: RequestHandler = async (req, res) => {
  const cycles = await workCyclesService.list(owner(req));
  const body: ApiSuccessResponse<{ cycles: typeof cycles }> = { success: true, data: { cycles } };
  res.json(body);
};
export const getWorkCycle: RequestHandler = async (req, res) => sendCycle(res, await workCyclesService.get(owner(req), params(req).cycleId));
export const createWorkCycle: RequestHandler = async (req, res) => sendCycle(res, await workCyclesService.create(owner(req), getValidatedRequestPart<CreateCycleBody>(req, "body")), 201);
export const updateWorkCycle: RequestHandler = async (req, res) => sendCycle(res, await workCyclesService.update(owner(req), params(req).cycleId, getValidatedRequestPart<UpdateCycleBody>(req, "body")));
export const addWorkCycleKpis: RequestHandler = async (req, res) => sendCycle(res, await workCyclesService.addKpis(owner(req), params(req).cycleId, getValidatedRequestPart<AddCycleKpisBody>(req, "body")));
export const setCurrentWorkCycle: RequestHandler = async (req, res) => sendCycle(res, await workCyclesService.setCurrent(owner(req), params(req).cycleId));
export const closeWorkCycle: RequestHandler = async (req, res) => sendCycle(res, await workCyclesService.close(owner(req), params(req).cycleId));
export const reopenWorkCycle: RequestHandler = async (req, res) => sendCycle(res, await workCyclesService.reopen(owner(req), params(req).cycleId));
export const archiveWorkCycle: RequestHandler = async (req, res) => { await workCyclesService.archive(owner(req), params(req).cycleId); res.status(204).send(); };
export const removeWorkCycleKpi: RequestHandler = async (req, res) => { const value=params(req); await workCyclesService.removeInstance(owner(req), value.cycleId, value.instanceId!); res.status(204).send(); };
export const reorderWorkCycles: RequestHandler = async (req, res) => {
  const { cycleIds } = getValidatedRequestPart<{ cycleIds: number[] }>(req, "body");
  const cycles = await workCyclesService.reorder(owner(req), cycleIds);
  res.json({ success: true, data: { cycles } });
};
export const reorderWorkCycleKpis: RequestHandler = async (req, res) => {
  const { instanceIds } = getValidatedRequestPart<{ instanceIds: number[] }>(req, "body");
  sendCycle(res, await workCyclesService.reorderInstances(owner(req), params(req).cycleId, instanceIds));
};
