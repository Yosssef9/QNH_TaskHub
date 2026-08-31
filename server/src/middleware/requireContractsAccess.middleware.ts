import type { NextFunction, Request, Response } from "express";

import { AppError } from "../shared/errors/app-error.js";

export function requireContractsAccess(req: Request, _res: Response, next: NextFunction): void {
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

  if (!req.authContext.access.contractsEnabled) {
    next(
      new AppError({
        statusCode: 403,
        code: "CONTRACTS_ACCESS_REQUIRED",
        message: "The Contracts module is not enabled for this user.",
      }),
    );
    return;
  }

  next();
}
