import { Router, type Router as ExpressRouter } from "express";

import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { listCalendarTasks, searchCalendarTasks } from "./calendar.controller.js";
import { calendarSearchQuerySchema, calendarTasksQuerySchema } from "./calendar.schemas.js";

export const calendarRouter: ExpressRouter = Router();

calendarRouter.use(verifyPortalJwt, resolveTaskHubAccess);
calendarRouter.get(
  "/search",
  validateRequest({ query: calendarSearchQuerySchema }),
  searchCalendarTasks,
);
calendarRouter.get(
  "/tasks",
  validateRequest({ query: calendarTasksQuerySchema }),
  listCalendarTasks,
);
