import { Router, type Router as ExpressRouter } from "express";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import { groupInputSchema, groupIdParamsSchema, updateGroupSchema, deleteGroupQuerySchema, type GroupInput } from "./procurement-item-code-groups.schemas.js";
import * as repo from "./procurement-item-code-groups.repository.js";

export const procurementItemCodeGroupsRouter: ExpressRouter = Router();

function recordConflict(error: unknown): never {
  const code = typeof error === "object" && error !== null && "number" in error ? (error as { number: unknown }).number : null;
  if (code === 2601 || code === 2627) {
    throw new AppError({ statusCode: 409, code: "ITEM_CODE_GROUP_DUPLICATE", message: "A group with this name or code prefix already exists." });
  }
  throw error;
}
function stale(): AppError {
  return new AppError({ statusCode: 409, code: "ITEM_CODE_GROUP_STALE", message: "Group was modified or deleted by another user. Refresh and retry." });
}

procurementItemCodeGroupsRouter.get("/", async (_req, res) => {
  const body: ApiSuccessResponse<{ items: repo.ItemCodeGroup[] }> = { success: true, data: { items: await repo.listGroups() } };
  res.json(body);
});
procurementItemCodeGroupsRouter.post("/", validateRequest({ body: groupInputSchema }), async (req, res) => {
  const input = getValidatedRequestPart<GroupInput>(req, "body");
  try {
    const data = await repo.createGroup(input);
    const body: ApiSuccessResponse<repo.ItemCodeGroup> = { success: true, data };
    res.status(201).json(body);
  } catch (error) { recordConflict(error); }
});
procurementItemCodeGroupsRouter.patch("/:groupId", validateRequest({ params: groupIdParamsSchema, body: updateGroupSchema }), async (req, res) => {
  const { groupId } = getValidatedRequestPart<{ groupId: number }>(req, "params");
  const { rowVersion, ...input } = getValidatedRequestPart<GroupInput & { rowVersion: string }>(req, "body");
  try {
    const data = await repo.updateGroup(groupId, input, rowVersion);
    if (!data) throw stale();
    const body: ApiSuccessResponse<repo.ItemCodeGroup> = { success: true, data };
    res.json(body);
  } catch (error) { recordConflict(error); }
});
procurementItemCodeGroupsRouter.delete("/:groupId", validateRequest({ params: groupIdParamsSchema, query: deleteGroupQuerySchema }), async (req, res) => {
  const { groupId } = getValidatedRequestPart<{ groupId: number }>(req, "params");
  const { rowVersion } = getValidatedRequestPart<{ rowVersion: string }>(req, "query");
  if (!(await repo.deleteGroup(groupId, rowVersion))) throw stale();
  res.status(204).send();
});
