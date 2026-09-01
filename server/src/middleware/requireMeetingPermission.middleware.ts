import type { NextFunction, Request, Response } from "express";

import { hasMeetingPermission } from "../modules/meetings/meetings.policy.js";
import type { MeetingPermissionCode } from "../modules/meetings/meetings.types.js";
import { AppError } from "../shared/errors/app-error.js";

export function requireMeetingPermission(permission: MeetingPermissionCode) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const access = req.authContext?.access;

    if (!access) {
      next(
        new AppError({
          statusCode: 500,
          code: "AUTH_CONTEXT_MISSING",
          message: "Authenticated TaskHub access was not resolved.",
        }),
      );
      return;
    }

    if (!hasMeetingPermission(access, permission)) {
      next(
        new AppError({
          statusCode: 403,
          code: "FORBIDDEN",
          message: "You do not have permission to perform this Meeting operation.",
        }),
      );
      return;
    }

    next();
  };
}
