import type { NextFunction, Request, Response } from "express";

import type { TaskHubRoleCode } from "../modules/auth/auth.types.js";
import { AppError } from "../shared/errors/app-error.js";

export function requireRole(...allowedRoles: readonly TaskHubRoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const roleCode = req.authContext?.access.roleCode;

    if (!roleCode) {
      next(
        new AppError({
          statusCode: 500,
          code: "AUTH_CONTEXT_MISSING",
          message: "Authenticated TaskHub access was not resolved.",
        }),
      );
      return;
    }

    if (!allowedRoles.includes(roleCode)) {
      next(
        new AppError({
          statusCode: 403,
          code: "FORBIDDEN",
          message: "You do not have permission to perform this operation.",
        }),
      );
      return;
    }

    next();
  };
}
