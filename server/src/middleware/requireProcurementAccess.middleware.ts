import type { NextFunction, Request, Response } from "express";

import { AppError } from "../shared/errors/app-error.js";

export function requireProcurementAccess(req: Request, _res: Response, next: NextFunction): void {
  if (!req.authContext) {
    next(
      new AppError({
        statusCode: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authenticated TaskHub access was not resolved.",
      }),
    );
    return;
  }

  if (!req.authContext.access.procurementEnabled) {
    next(
      new AppError({
        statusCode: 403,
        code: "PROCUREMENT_ACCESS_REQUIRED",
        message: "The Procurement module is not enabled for this user.",
      }),
    );
    return;
  }

  next();
}
