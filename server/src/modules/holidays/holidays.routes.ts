import { Router, type Router as ExpressRouter } from "express";
import { requireRole } from "../../middleware/requireRole.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { createHoliday, listHolidays, updateHoliday } from "./holidays.controller.js";
import { holidayParamsSchema, saveHolidayBodySchema } from "./holidays.schemas.js";
export const holidaysRouter: ExpressRouter = Router();
holidaysRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireRole("ADMIN"));
holidaysRouter.get("/", listHolidays);
holidaysRouter.post("/", validateRequest({ body: saveHolidayBodySchema }), createHoliday);
holidaysRouter.put(
  "/:holidayId",
  validateRequest({ params: holidayParamsSchema, body: saveHolidayBodySchema }),
  updateHoliday,
);
