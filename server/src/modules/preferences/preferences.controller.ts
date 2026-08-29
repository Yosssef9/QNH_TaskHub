import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { UserPreferences } from "../auth/auth.types.js";
import type { UpdatePreferencesBody } from "./preferences.schemas.js";
import { preferencesService } from "./preferences.service.js";

export const updateCurrentUserPreferences: RequestHandler = async (req, res) => {
  const userId = req.authContext?.user.userId;

  if (!userId) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }

  const input = getValidatedRequestPart<UpdatePreferencesBody>(req, "body");
  const preferences = await preferencesService.update(userId, input);
  const body: ApiSuccessResponse<{ preferences: UserPreferences }> = {
    success: true,
    data: { preferences },
  };

  res.status(200).json(body);
};
