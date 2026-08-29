import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import { holidaysService } from "./holidays.service.js";
import type { HolidayParams, SaveHolidayBody } from "./holidays.schemas.js";

function actor(req: Request) {
  const userId = req.authContext?.user.userId;
  if (!userId)
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated access was not resolved.",
    });
  return userId;
}

export const listHolidays: RequestHandler = async (_req, res) =>
  res.json({ success: true, data: { holidays: await holidaysService.list() } });

export const createHoliday: RequestHandler = async (req, res) => {
  const holiday = await holidaysService.create(
    actor(req),
    getValidatedRequestPart<SaveHolidayBody>(req, "body"),
  );
  res.status(201).json({ success: true, data: { holiday } });
};

export const updateHoliday: RequestHandler = async (req, res) => {
  const holiday = await holidaysService.update(
    actor(req),
    getValidatedRequestPart<HolidayParams>(req, "params").holidayId,
    getValidatedRequestPart<SaveHolidayBody>(req, "body"),
  );
  res.json({ success: true, data: { holiday } });
};
