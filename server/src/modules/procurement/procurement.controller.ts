import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import {
  procurementSyncService,
  type ProcurementSyncRequestResult,
  type ProcurementSyncStatusResult,
} from "./procurement-sync.service.js";

function actor(req: Request): number {
  const value = req.authContext?.user.userId;
  if (!value) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return value;
}

export const getProcurementSyncStatus: RequestHandler = async (_req, res) => {
  const data = await procurementSyncService.getStatus();
  const body: ApiSuccessResponse<ProcurementSyncStatusResult> = { success: true, data };
  res.status(200).json(body);
};

export const syncProcurement: RequestHandler = async (req, res) => {
  const data = await procurementSyncService.requestManualRun(actor(req));
  const body: ApiSuccessResponse<ProcurementSyncRequestResult> = { success: true, data };
  res.status(data.accepted ? 202 : 200).json(body);
};
