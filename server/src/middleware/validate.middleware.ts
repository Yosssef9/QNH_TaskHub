import type { NextFunction, Request, Response } from "express";

import { type ZodType } from "zod";

import { AppError } from "../shared/errors/app-error.js";

interface RequestValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validateRequest(schemas: RequestValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const validations = [
      {
        location: "body",
        schema: schemas.body,
        value: req.body,
      },

      {
        location: "params",
        schema: schemas.params,
        value: req.params,
      },

      {
        location: "query",
        schema: schemas.query,
        value: req.query,
      },
    ] as const;

    for (const validation of validations) {
      if (!validation.schema) {
        continue;
      }

      const result = validation.schema.safeParse(validation.value);

      if (!result.success) {
        next(
          new AppError({
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: `Invalid request ${validation.location}.`,

            details: result.error.issues,
          }),
        );

        return;
      }

      req.validated = {
        ...req.validated,
        [validation.location]: result.data,
      };
    }

    next();
  };
}
