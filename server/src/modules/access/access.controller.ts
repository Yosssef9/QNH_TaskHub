import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { AccessListQueryInput, AccessUserParams, UpdateAccessBody } from "./access.schemas.js";
import { accessService } from "./access.service.js";
import type { AccessUser, AccessUserList } from "./access.types.js";

export const listAccessUsers: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<AccessListQueryInput>(req, "query");
  const data = await accessService.listUsers(query);
  const body: ApiSuccessResponse<AccessUserList> = { success: true, data };

  res.status(200).json(body);
};

export const updateAccessUser: RequestHandler = async (req, res) => {
  const actorUserId = req.authContext?.user.userId;

  if (!actorUserId) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }

  const params = getValidatedRequestPart<AccessUserParams>(req, "params");
  const input = getValidatedRequestPart<UpdateAccessBody>(req, "body");
  const user = await accessService.updateUserAccess(actorUserId, {
    userId: params.userId,
    ...input,
  });
  const body: ApiSuccessResponse<{ user: AccessUser }> = {
    success: true,
    data: { user },
  };

  res.status(200).json(body);
};
