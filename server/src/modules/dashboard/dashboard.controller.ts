import type { RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import { dashboardService } from "./dashboard.service.js";
import type { DashboardData } from "./dashboard.types.js";

export const getDashboard: RequestHandler = async (req, res) => {
  const owner = req.authContext?.user.userId;
  if (!owner) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  }

  const dashboard = await dashboardService.get(owner);
  const body: ApiSuccessResponse<DashboardData> = { success: true, data: dashboard };
  res.json(body);
};
