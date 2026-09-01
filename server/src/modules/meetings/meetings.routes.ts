import { Router, type Router as ExpressRouter } from "express";

import { requireRole } from "../../middleware/requireRole.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  createMeetingRoom,
  listActiveMeetingRooms,
  listAdminMeetingRooms,
  updateMeetingRoom,
} from "./meetings.controller.js";
import {
  createMeetingRoomBodySchema,
  meetingRoomParamsSchema,
  updateMeetingRoomBodySchema,
} from "./meetings.schemas.js";

export const meetingsRouter: ExpressRouter = Router();
export const meetingRoomsAdminRouter: ExpressRouter = Router();

meetingsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
meetingsRouter.get("/rooms", listActiveMeetingRooms);

meetingRoomsAdminRouter.use(verifyPortalJwt, resolveTaskHubAccess, requireRole("ADMIN"));
meetingRoomsAdminRouter.get("/", listAdminMeetingRooms);
meetingRoomsAdminRouter.post(
  "/",
  validateRequest({ body: createMeetingRoomBodySchema }),
  createMeetingRoom,
);
meetingRoomsAdminRouter.put(
  "/:roomId",
  validateRequest({
    params: meetingRoomParamsSchema,
    body: updateMeetingRoomBodySchema,
  }),
  updateMeetingRoom,
);
