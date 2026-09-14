import { Router, type Router as ExpressRouter } from "express";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { listAssignedMeetingActionItems } from "./meeting-action-items.controller.js";
import { assignedActionItemsQuerySchema } from "./meeting-action-items.schemas.js";

export const meetingActionItemsRouter: ExpressRouter = Router();
meetingActionItemsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
meetingActionItemsRouter.get(
  "/assigned",
  validateRequest({ query: assignedActionItemsQuerySchema }),
  listAssignedMeetingActionItems,
);
