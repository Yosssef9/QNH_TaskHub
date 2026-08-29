import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type {
  CreateListBody,
  ListParams,
  ReorderListsBody,
  UpdateListBody,
} from "./lists.schemas.js";
import { listsService } from "./lists.service.js";
import type { PersonalList } from "./lists.types.js";

function getOwnerUserId(req: Request): number {
  const userId = req.authContext?.user.userId;
  if (!userId) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return userId;
}

export const listPersonalLists: RequestHandler = async (req, res) => {
  const lists = await listsService.list(getOwnerUserId(req));
  const body: ApiSuccessResponse<{ lists: PersonalList[] }> = { success: true, data: { lists } };
  res.status(200).json(body);
};

export const createPersonalList: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateListBody>(req, "body");
  const list = await listsService.create(getOwnerUserId(req), input);
  const body: ApiSuccessResponse<{ list: PersonalList }> = { success: true, data: { list } };
  res.status(201).json(body);
};

export const updatePersonalList: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ListParams>(req, "params");
  const input = getValidatedRequestPart<UpdateListBody>(req, "body");
  const list = await listsService.update(getOwnerUserId(req), params.listId, input);
  const body: ApiSuccessResponse<{ list: PersonalList }> = { success: true, data: { list } };
  res.status(200).json(body);
};

export const reorderPersonalLists: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<ReorderListsBody>(req, "body");
  const lists = await listsService.reorder(getOwnerUserId(req), input.listIds);
  const body: ApiSuccessResponse<{ lists: PersonalList[] }> = { success: true, data: { lists } };
  res.status(200).json(body);
};

export const archivePersonalList: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<ListParams>(req, "params");
  await listsService.archive(getOwnerUserId(req), params.listId);
  res.status(204).send();
};
