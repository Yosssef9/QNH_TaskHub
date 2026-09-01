import { Router, type Router as ExpressRouter } from "express";

import { requireMeetingPermission } from "../../middleware/requireMeetingPermission.middleware.js";
import { requireRole } from "../../middleware/requireRole.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import {
  approveMeetingRequest,
  checkMeetingAvailability,
  createDirectMeeting,
  createMeetingRequest,
  createMeetingRoom,
  listActiveMeetingRooms,
  listAdminMeetingRooms,
  listCoordinatorMeetingQueue,
  listMeetingSchedule,
  listMyMeetingRequests,
  listMyMeetings,
  rejectMeetingRequest,
  searchMeetingParticipants,
  updateCoordinatorMeetingSchedule,
  updateMeetingRoom,
} from "./meetings.controller.js";
import {
  createMeetingBodySchema,
  decideMeetingRequestBodySchema,
  meetingParticipantQuerySchema,
  meetingRequestParamsSchema,
  meetingScheduleQuerySchema,
  rejectMeetingRequestBodySchema,
  updateMeetingScheduleBodySchema,
} from "./meeting-workflow.schemas.js";
import {
  createMeetingRoomBodySchema,
  meetingAvailabilityBodySchema,
  meetingRoomParamsSchema,
  updateMeetingRoomBodySchema,
} from "./meetings.schemas.js";

export const meetingsRouter: ExpressRouter = Router();
export const meetingRoomsAdminRouter: ExpressRouter = Router();

meetingsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
meetingsRouter.get("/rooms", listActiveMeetingRooms);
meetingsRouter.get("/mine", listMyMeetings);
meetingsRouter.get(
  "/schedule",
  validateRequest({ query: meetingScheduleQuerySchema }),
  listMeetingSchedule,
);
meetingsRouter.get(
  "/participants",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({ query: meetingParticipantQuerySchema }),
  searchMeetingParticipants,
);
meetingsRouter.post(
  "/availability",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({ body: meetingAvailabilityBodySchema }),
  checkMeetingAvailability,
);
meetingsRouter.get(
  "/requests/mine",
  requireMeetingPermission("MEETING_ORGANIZE"),
  listMyMeetingRequests,
);
meetingsRouter.post(
  "/requests",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({ body: createMeetingBodySchema }),
  createMeetingRequest,
);
meetingsRouter.post(
  "/direct",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ body: createMeetingBodySchema }),
  createDirectMeeting,
);
meetingsRouter.get(
  "/coordinator/queue",
  requireMeetingPermission("MEETING_COORDINATE"),
  listCoordinatorMeetingQueue,
);
meetingsRouter.patch(
  "/coordinator/requests/:meetingId",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingRequestParamsSchema,
    body: updateMeetingScheduleBodySchema,
  }),
  updateCoordinatorMeetingSchedule,
);
meetingsRouter.post(
  "/coordinator/requests/:meetingId/approve",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingRequestParamsSchema,
    body: decideMeetingRequestBodySchema,
  }),
  approveMeetingRequest,
);
meetingsRouter.post(
  "/coordinator/requests/:meetingId/reject",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingRequestParamsSchema,
    body: rejectMeetingRequestBodySchema,
  }),
  rejectMeetingRequest,
);

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
