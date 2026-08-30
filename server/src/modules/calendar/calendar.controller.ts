import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { CalendarSearchQueryInput, CalendarTasksQueryInput } from "./calendar.schemas.js";
import { calendarService } from "./calendar.service.js";
import type { CalendarSearchData, CalendarTasksData } from "./calendar.types.js";

function ownerId(req: Request): number {
  const id = req.authContext?.user.userId;
  if (!id) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  }
  return id;
}

export const listCalendarTasks: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<CalendarTasksQueryInput>(req, "query");
  const data = await calendarService.listTasks(ownerId(req), query);
  const body: ApiSuccessResponse<CalendarTasksData> = { success: true, data };
  res.status(200).json(body);
};

export const searchCalendarTasks: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<CalendarSearchQueryInput>(req, "query");
  const data = await calendarService.searchTasks(ownerId(req), query);
  const body: ApiSuccessResponse<CalendarSearchData> = { success: true, data };
  res.status(200).json(body);
};
