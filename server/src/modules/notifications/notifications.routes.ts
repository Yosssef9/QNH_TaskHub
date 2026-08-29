import { Router, type Router as ExpressRouter } from "express";

import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.controller.js";
import {
  notificationListQuerySchema,
  notificationParamsSchema,
} from "./notifications.schemas.js";

export const notificationsRouter: ExpressRouter = Router();
notificationsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
notificationsRouter.get(
  "/",
  validateRequest({ query: notificationListQuerySchema }),
  listNotifications,
);
notificationsRouter.patch("/read-all", markAllNotificationsRead);
notificationsRouter.patch(
  "/:notificationId/read",
  validateRequest({ params: notificationParamsSchema }),
  markNotificationRead,
);
