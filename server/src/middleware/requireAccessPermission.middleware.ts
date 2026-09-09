import type { NextFunction, Request, Response } from "express";

import {
  hasAccessPermission,
  hasAnyProcurementAccess,
} from "../modules/access-permissions/access-permissions.policy.js";
import type { ProcurementEntityCode } from "../modules/access-permissions/access-permissions.types.js";
import { AppError } from "../shared/errors/app-error.js";

function context(req: Request) {
  if (!req.authContext) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return req.authContext;
}

export function requireProcurementEntityAccess(entityCode: ProcurementEntityCode) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const auth = context(req);
      if (!hasAccessPermission(auth.access.permissions, entityCode, "ACCESS")) {
        next(
          new AppError({
            statusCode: 403,
            code: "PROCUREMENT_ENTITY_ACCESS_REQUIRED",
            message: `Access to Procurement ${entityCode} is not enabled for this user.`,
          }),
        );
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAnyProcurementAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const auth = context(req);
    if (!hasAnyProcurementAccess(auth.access.permissions)) {
      next(
        new AppError({
          statusCode: 403,
          code: "PROCUREMENT_ACCESS_REQUIRED",
          message: "At least one Procurement area must be enabled for this user.",
        }),
      );
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}


export function requireItemOptionsAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const auth = context(req);
    const allowed = (["ITEMS", "PRICE_QUOTES"] as const).some((entity) =>
      hasAccessPermission(auth.access.permissions, entity, "ACCESS"),
    );
    if (!allowed) {
      next(
        new AppError({
          statusCode: 403,
          code: "PROCUREMENT_ACCESS_REQUIRED",
          message: "Items or Price Quotes access is required before Item options can be read.",
        }),
      );
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireSupplierOptionsAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const auth = context(req);
    const allowed = ["CONTRACTS", "ITEMS", "SUPPLIERS", "PRICE_QUOTES"].some((entity) =>
      hasAccessPermission(
        auth.access.permissions,
        entity as ProcurementEntityCode,
        "ACCESS",
      ),
    );
    if (!allowed) {
      next(
        new AppError({
          statusCode: 403,
          code: "PROCUREMENT_ACCESS_REQUIRED",
          message: "A Procurement area must be enabled before Supplier options can be read.",
        }),
      );
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
