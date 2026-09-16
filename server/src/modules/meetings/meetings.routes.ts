import { Router, type Router as ExpressRouter } from "express";

import { requireMeetingPermission } from "../../middleware/requireMeetingPermission.middleware.js";
import { requireRole } from "../../middleware/requireRole.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { uploadSingleMeetingAttachment } from "./meeting-attachment-upload.middleware.js";
import {
  createMeetingActionItem,
  listMeetingActionItemAssignees,
  listMeetingActionItems,
  reassignMeetingActionItem,
} from "../meeting-action-items/meeting-action-items.controller.js";
import {
  createMeetingDecision,
  getMeetingFollowUp,
  listRelatedMeetings,
  saveMeetingFollowUpNotes,
  updateMeetingDecision,
} from "../meeting-followup/meeting-followup.controller.js";
import {
  createMeetingDecisionBodySchema,
  meetingDecisionParamsSchema,
  saveMeetingFollowUpNotesBodySchema,
  updateMeetingDecisionBodySchema,
} from "../meeting-followup/meeting-followup.schemas.js";
import {
  createMeetingActionItemBodySchema,
  meetingActionItemParamsSchema,
  reassignMeetingActionItemBodySchema,
} from "../meeting-action-items/meeting-action-items.schemas.js";
import {
  adjustAndApproveMeetingRequest,
  adjustAndApproveMeetingReschedule,
  approveMeetingRequest,
  approveMeetingReschedule,
  archiveMeetingTemplate,
  cancelMeeting,
  cancelOrganizerMeetingReschedule,
  checkMeetingAvailability,
  createDirectMeeting,
  createMeetingSeries,
  createMeetingRequest,
  createMeetingRoom,
  createMeetingTemplate,
  coordinatorDirectRescheduleMeeting,
  downloadMeetingAttachment,
  getMeetingDetail,
  getMeetingSeriesDetail,
  getMeetingSeriesLinkForMeeting,
  listActiveMeetingRooms,
  listAdminMeetingRooms,
  listCoordinatorMeetingQueue,
  listCoordinatorReschedules,
  listMeetingAttachments,
  listMeetingSchedule,
  listMeetingSeries,
  listMeetingTemplates,
  listMyMeetingRequests,
  listMyMeetings,
  previewMeetingAttachment,
  previewMeetingSeries,
  rejectMeetingRequest,
  rejectMeetingReschedule,
  removeMeetingAttachment,
  requestMeetingReschedule,
  searchMeetingParticipants,
  updateCoordinatorMeetingSchedule,
  updateCoordinatorReschedule,
  updateMeetingAgenda,
  updateOrganizerMeetingReschedule,
  updateOrganizerPendingMeetingSchedule,
  updateMeetingRoom,
  updateMeetingTemplate,
  uploadMeetingAttachment,
  uploadMeetingSeriesAttachment,
} from "./meetings.controller.js";
import {
  createMeetingSeriesBodySchema,
  meetingSeriesAttachmentBodySchema,
  meetingSeriesListQuerySchema,
  meetingSeriesMeetingParamsSchema,
  meetingSeriesParamsSchema,
  meetingSeriesPreviewBodySchema,
} from "./meeting-series.schemas.js";
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
  archiveMeetingTemplateBodySchema,
  cancelMeetingBodySchema,
  cancelMeetingRescheduleRequestBodySchema,
  coordinatorDirectRescheduleBodySchema,
  createMeetingRescheduleBodySchema,
  createMeetingTemplateBodySchema,
  decideMeetingRescheduleBodySchema,
  meetingAttachmentParamsSchema,
  meetingTemplateParamsSchema,
  meetingWorkspaceParamsSchema,
  rejectMeetingRescheduleBodySchema,
  updateMeetingAgendaBodySchema,
  updateMeetingRescheduleBodySchema,
  updateMeetingTemplateBodySchema,
  updateOrganizerRescheduleBodySchema,
} from "./meeting-workspace.schemas.js";
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
meetingsRouter.patch(
  "/requests/:meetingId/schedule",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({
    params: meetingRequestParamsSchema,
    body: updateMeetingScheduleBodySchema,
  }),
  updateOrganizerPendingMeetingSchedule,
);
meetingsRouter.post(
  "/direct",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ body: createMeetingBodySchema }),
  createDirectMeeting,
);

meetingsRouter.get(
  "/series",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ query: meetingSeriesListQuerySchema }),
  listMeetingSeries,
);
meetingsRouter.get(
  "/series/by-meeting/:meetingId",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ params: meetingSeriesMeetingParamsSchema }),
  getMeetingSeriesLinkForMeeting,
);
meetingsRouter.get(
  "/series/:seriesId",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ params: meetingSeriesParamsSchema }),
  getMeetingSeriesDetail,
);

meetingsRouter.post(
  "/series/preview",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ body: meetingSeriesPreviewBodySchema }),
  previewMeetingSeries,
);
meetingsRouter.post(
  "/series",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ body: createMeetingSeriesBodySchema }),
  createMeetingSeries,
);
meetingsRouter.post(
  "/series/:seriesId/attachments",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({ params: meetingSeriesParamsSchema }),
  uploadSingleMeetingAttachment,
  validateRequest({ body: meetingSeriesAttachmentBodySchema }),
  uploadMeetingSeriesAttachment,
);

meetingsRouter.get(
  "/templates",
  requireMeetingPermission("MEETING_ORGANIZE"),
  listMeetingTemplates,
);
meetingsRouter.post(
  "/templates",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({ body: createMeetingTemplateBodySchema }),
  createMeetingTemplate,
);
meetingsRouter.put(
  "/templates/:templateId",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({
    params: meetingTemplateParamsSchema,
    body: updateMeetingTemplateBodySchema,
  }),
  updateMeetingTemplate,
);
meetingsRouter.post(
  "/templates/:templateId/archive",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({
    params: meetingTemplateParamsSchema,
    body: archiveMeetingTemplateBodySchema,
  }),
  archiveMeetingTemplate,
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
  "/coordinator/requests/:meetingId/adjust-and-approve",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingRequestParamsSchema,
    body: updateMeetingScheduleBodySchema,
  }),
  adjustAndApproveMeetingRequest,
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
meetingsRouter.get(
  "/coordinator/reschedules",
  requireMeetingPermission("MEETING_COORDINATE"),
  listCoordinatorReschedules,
);
meetingsRouter.patch(
  "/coordinator/reschedules/:meetingId",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: updateMeetingRescheduleBodySchema,
  }),
  updateCoordinatorReschedule,
);
meetingsRouter.post(
  "/coordinator/reschedules/:meetingId/adjust-and-approve",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: updateMeetingRescheduleBodySchema,
  }),
  adjustAndApproveMeetingReschedule,
);
meetingsRouter.post(
  "/coordinator/meetings/:meetingId/reschedule",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: coordinatorDirectRescheduleBodySchema,
  }),
  coordinatorDirectRescheduleMeeting,
);
meetingsRouter.post(
  "/coordinator/reschedules/:meetingId/approve",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: decideMeetingRescheduleBodySchema,
  }),
  approveMeetingReschedule,
);
meetingsRouter.post(
  "/coordinator/reschedules/:meetingId/reject",
  requireMeetingPermission("MEETING_COORDINATE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: rejectMeetingRescheduleBodySchema,
  }),
  rejectMeetingReschedule,
);

meetingsRouter.get(
  "/attachments/:attachmentId/preview",
  validateRequest({ params: meetingAttachmentParamsSchema }),
  previewMeetingAttachment,
);
meetingsRouter.get(
  "/attachments/:attachmentId/download",
  validateRequest({ params: meetingAttachmentParamsSchema }),
  downloadMeetingAttachment,
);
meetingsRouter.delete(
  "/attachments/:attachmentId",
  validateRequest({ params: meetingAttachmentParamsSchema }),
  removeMeetingAttachment,
);

meetingsRouter.get(
  "/:meetingId/related-meetings",
  validateRequest({ params: meetingWorkspaceParamsSchema }),
  listRelatedMeetings,
);

meetingsRouter.get(
  "/:meetingId/follow-up",
  validateRequest({ params: meetingWorkspaceParamsSchema }),
  getMeetingFollowUp,
);
meetingsRouter.post(
  "/:meetingId/decisions",
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: createMeetingDecisionBodySchema,
  }),
  createMeetingDecision,
);
meetingsRouter.patch(
  "/:meetingId/decisions/:decisionId",
  validateRequest({
    params: meetingDecisionParamsSchema,
    body: updateMeetingDecisionBodySchema,
  }),
  updateMeetingDecision,
);
meetingsRouter.put(
  "/:meetingId/follow-up-notes",
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: saveMeetingFollowUpNotesBodySchema,
  }),
  saveMeetingFollowUpNotes,
);

meetingsRouter.get(
  "/:meetingId/action-item-assignees",
  validateRequest({ params: meetingWorkspaceParamsSchema }),
  listMeetingActionItemAssignees,
);
meetingsRouter.get(
  "/:meetingId/action-items",
  validateRequest({ params: meetingWorkspaceParamsSchema }),
  listMeetingActionItems,
);
meetingsRouter.post(
  "/:meetingId/action-items",
  validateRequest({ params: meetingWorkspaceParamsSchema, body: createMeetingActionItemBodySchema }),
  createMeetingActionItem,
);
meetingsRouter.patch(
  "/:meetingId/action-items/:taskId/assignee",
  validateRequest({
    params: meetingActionItemParamsSchema,
    body: reassignMeetingActionItemBodySchema,
  }),
  reassignMeetingActionItem,
);

meetingsRouter.get(
  "/:meetingId",
  validateRequest({ params: meetingWorkspaceParamsSchema }),
  getMeetingDetail,
);
meetingsRouter.put(
  "/:meetingId/agenda",
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: updateMeetingAgendaBodySchema,
  }),
  updateMeetingAgenda,
);
meetingsRouter.post(
  "/:meetingId/reschedule",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: createMeetingRescheduleBodySchema,
  }),
  requestMeetingReschedule,
);
meetingsRouter.patch(
  "/:meetingId/reschedule",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: updateOrganizerRescheduleBodySchema,
  }),
  updateOrganizerMeetingReschedule,
);
meetingsRouter.post(
  "/:meetingId/reschedule/cancel",
  requireMeetingPermission("MEETING_ORGANIZE"),
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: cancelMeetingRescheduleRequestBodySchema,
  }),
  cancelOrganizerMeetingReschedule,
);
meetingsRouter.post(
  "/:meetingId/cancel",
  validateRequest({
    params: meetingWorkspaceParamsSchema,
    body: cancelMeetingBodySchema,
  }),
  cancelMeeting,
);
meetingsRouter.get(
  "/:meetingId/attachments",
  validateRequest({ params: meetingWorkspaceParamsSchema }),
  listMeetingAttachments,
);
meetingsRouter.post(
  "/:meetingId/attachments",
  validateRequest({ params: meetingWorkspaceParamsSchema }),
  uploadSingleMeetingAttachment,
  uploadMeetingAttachment,
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






