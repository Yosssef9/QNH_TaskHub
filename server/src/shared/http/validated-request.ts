import type { Request } from "express";

import { AppError } from "../errors/app-error.js";

type ValidatedPart = "body" | "params" | "query";

export function getValidatedRequestPart<T>(req: Request, part: ValidatedPart): T {
  const value = req.validated?.[part];

  if (value === undefined) {
    throw new AppError({
      statusCode: 500,
      code: "VALIDATED_REQUEST_MISSING",
      message: `Validated request ${part} was not resolved.`,
    });
  }

  return value as T;
}
