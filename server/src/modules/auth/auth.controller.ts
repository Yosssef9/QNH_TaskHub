import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { AuthMeData } from "./auth.types.js";

export const getCurrentUser: RequestHandler = (req, res) => {
  if (!req.authContext) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated Portal identity was not resolved.",
    });
  }

  const body: ApiSuccessResponse<AuthMeData> = {
    success: true,
    data: req.authContext,
  };

  res.status(200).json(body);
};
