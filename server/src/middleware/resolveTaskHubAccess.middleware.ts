import type { NextFunction, Request, Response } from "express";

import { authService } from "../modules/auth/auth.service.js";
import { AppError } from "../shared/errors/app-error.js";

export async function resolveTaskHubAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.portalIdentity) {
    next(
      new AppError({
        statusCode: 500,
        code: "PORTAL_IDENTITY_MISSING",
        message: "Verified Portal identity was not resolved.",
      }),
    );
    return;
  }

  try {
    req.authContext = await authService.resolveCurrentUser(req.portalIdentity.userCode);
    next();
  } catch (error) {
    next(error);
  }
}
