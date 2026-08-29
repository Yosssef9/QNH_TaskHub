import type { ErrorRequestHandler } from "express";

import { logger } from "../config/logger.js";

import { AppError } from "../shared/errors/app-error.js";

import type { ApiErrorResponse } from "../shared/types/result.js";

export const errorMiddleware: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,

      error: {
        code: error.code,
        message: error.message,

        ...(error.details !== undefined
          ? {
              details: error.details,
            }
          : {}),
      },
    };

    res.status(error.statusCode).json(body);

    return;
  }

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.originalUrl,
    },
    "Unhandled request error",
  );

  const body: ApiErrorResponse = {
    success: false,

    error: {
      code: "INTERNAL_SERVER_ERROR",

      message: "An unexpected error occurred.",
    },
  };

  res.status(500).json(body);
};
