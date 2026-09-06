import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { CreateSavedViewBody, DeleteSavedViewQuery, DuplicateSavedViewBody, SavedViewIdParams, UpdateSavedViewBody } from "./procurement-saved-views.schemas.js";
import { procurementSavedViewsService as service } from "./procurement-saved-views.service.js";
import type { ProcurementSavedView, ProcurementSavedViewDetail } from "./procurement-saved-views.types.js";

function owner(req: Request): number {
  const value = req.authContext?.user.userId;
  if (!value) throw new AppError({ statusCode: 500, code: "AUTH_CONTEXT_MISSING", message: "Authenticated TaskHub access was not resolved." });
  return value;
}

export const listSavedViews: RequestHandler = async (req, res) => {
  const items = await service.list(owner(req));
  const body: ApiSuccessResponse<{ items: ProcurementSavedView[] }> = { success: true, data: { items } };
  res.json(body);
};
export const getSavedView: RequestHandler = async (req, res) => {
  const { savedViewId } = getValidatedRequestPart<SavedViewIdParams>(req, "params");
  const data = await service.get(owner(req), savedViewId);
  const body: ApiSuccessResponse<ProcurementSavedViewDetail> = { success: true, data };
  res.json(body);
};
export const createSavedView: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateSavedViewBody>(req, "body");
  const data = await service.create(owner(req), input);
  const body: ApiSuccessResponse<ProcurementSavedViewDetail> = { success: true, data };
  res.status(201).json(body);
};
export const updateSavedView: RequestHandler = async (req, res) => {
  const { savedViewId } = getValidatedRequestPart<SavedViewIdParams>(req, "params");
  const input = getValidatedRequestPart<UpdateSavedViewBody>(req, "body");
  const { rowVersion, ...rest } = input;
  const data = await service.update(owner(req), savedViewId, rest, rowVersion);
  const body: ApiSuccessResponse<ProcurementSavedViewDetail> = { success: true, data };
  res.json(body);
};
export const deleteSavedView: RequestHandler = async (req, res) => {
  const { savedViewId } = getValidatedRequestPart<SavedViewIdParams>(req, "params");
  const { rowVersion } = getValidatedRequestPart<DeleteSavedViewQuery>(req, "query");
  await service.remove(owner(req), savedViewId, rowVersion);
  res.status(204).send();
};
export const duplicateSavedView: RequestHandler = async (req, res) => {
  const { savedViewId } = getValidatedRequestPart<SavedViewIdParams>(req, "params");
  const input = getValidatedRequestPart<DuplicateSavedViewBody>(req, "body");
  const data = await service.duplicate(owner(req), savedViewId, input.name);
  const body: ApiSuccessResponse<ProcurementSavedViewDetail> = { success: true, data };
  res.status(201).json(body);
};
export const setDefaultSavedView: RequestHandler = async (req, res) => {
  const { savedViewId } = getValidatedRequestPart<SavedViewIdParams>(req, "params");
  const data = await service.setDefault(owner(req), savedViewId);
  const body: ApiSuccessResponse<ProcurementSavedViewDetail> = { success: true, data };
  res.json(body);
};
