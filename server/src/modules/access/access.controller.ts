import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { ContractAccessAdminData } from "../access-permissions/access-permissions.types.js";
import type {
  AccessListQueryInput,
  AccessUserParams,
  ContractDelegationBody,
  UpdateAccessBody,
} from "./access.schemas.js";
import { accessService } from "./access.service.js";
import type { AccessUser, AccessUserList } from "./access.types.js";

function actorUserId(req: Parameters<RequestHandler>[0]): number {
  const value = req.authContext?.user.userId;
  if (!value) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return value;
}

export const listAccessUsers: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<AccessListQueryInput>(req, "query");
  const data = await accessService.listUsers(query);
  const body: ApiSuccessResponse<AccessUserList> = { success: true, data };
  res.status(200).json(body);
};

export const updateAccessUser: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<AccessUserParams>(req, "params");
  const input = getValidatedRequestPart<UpdateAccessBody>(req, "body");
  const user = await accessService.updateUserAccess(actorUserId(req), {
    userId: params.userId,
    ...input,
  });
  const body: ApiSuccessResponse<{ user: AccessUser }> = { success: true, data: { user } };
  res.status(200).json(body);
};

export const getContractAccessAdminData: RequestHandler = async (_req, res) => {
  const data = await accessService.getContractAccessAdminData();
  const body: ApiSuccessResponse<ContractAccessAdminData> = { success: true, data };
  res.status(200).json(body);
};

export const updateContractDelegation: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<ContractDelegationBody>(req, "body");
  const data = await accessService.updateContractDelegation(actorUserId(req), input);
  const body: ApiSuccessResponse<ContractAccessAdminData> = { success: true, data };
  res.status(200).json(body);
};
