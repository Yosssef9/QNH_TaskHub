import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import type {
  CreateMeetingBody,
  DecideMeetingRequestBody,
  MeetingParticipantQuery,
  MeetingRequestParams,
  MeetingScheduleQuery,
  RejectMeetingRequestBody,
  UpdateMeetingScheduleBody,
} from "./meeting-workflow.schemas.js";
import { meetingWorkflowService } from "./meeting-workflow.service.js";
import type {
  MeetingParticipantList,
  MeetingScheduleEntry,
  MeetingSummary,
} from "./meeting-workflow.types.js";
import type {
  CreateMeetingRoomBody,
  MeetingAvailabilityBody,
  MeetingRoomParams,
  UpdateMeetingRoomBody,
} from "./meetings.schemas.js";
import { meetingSchedulingService } from "./meeting-scheduling.service.js";
import { meetingsService } from "./meetings.service.js";
import type { MeetingAvailability } from "./meeting-scheduling.types.js";
import type { MeetingRoom } from "./meetings.types.js";
import type {
  ArchiveMeetingTemplateBody,
  CancelMeetingBody,
  CancelMeetingRescheduleRequestBody,
  CoordinatorDirectRescheduleBody,
  CreateMeetingRescheduleBody,
  CreateMeetingTemplateBody,
  DecideMeetingRescheduleBody,
  MeetingAttachmentParams,
  MeetingTemplateParams,
  MeetingWorkspaceParams,
  RejectMeetingRescheduleBody,
  UpdateMeetingAgendaBody,
  UpdateMeetingRescheduleBody,
  UpdateOrganizerRescheduleBody,
  UpdateMeetingTemplateBody,
} from "./meeting-workspace.schemas.js";
import { meetingWorkspaceService } from "./meeting-workspace.service.js";
import type {
  MeetingAttachment,
  MeetingDetail,
  MeetingRescheduleQueueItem,
  MeetingTemplate,
} from "./meeting-workspace.types.js";

function actorUserId(req: Request): number {
  const value = req.authContext?.user.userId;

  if (!value) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }

  return value;
}

function currentAccess(req: Request): TaskHubAccess {
  const access = req.authContext?.access;
  if (!access) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return access;
}

export const listActiveMeetingRooms: RequestHandler = async (_req, res) => {
  const rooms = await meetingsService.listActiveRooms();
  const body: ApiSuccessResponse<{ rooms: MeetingRoom[] }> = {
    success: true,
    data: { rooms },
  };

  res.status(200).json(body);
};

export const listAdminMeetingRooms: RequestHandler = async (_req, res) => {
  const rooms = await meetingsService.listAdminRooms();
  const body: ApiSuccessResponse<{ rooms: MeetingRoom[] }> = {
    success: true,
    data: { rooms },
  };

  res.status(200).json(body);
};

export const createMeetingRoom: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateMeetingRoomBody>(req, "body");
  const room = await meetingsService.createRoom(actorUserId(req), input);
  const body: ApiSuccessResponse<{ room: MeetingRoom }> = {
    success: true,
    data: { room },
  };

  res.status(201).json(body);
};

export const updateMeetingRoom: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingRoomParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingRoomBody>(req, "body");
  const room = await meetingsService.updateRoom(actorUserId(req), params.roomId, input);
  const body: ApiSuccessResponse<{ room: MeetingRoom }> = {
    success: true,
    data: { room },
  };

  res.status(200).json(body);
};

export const checkMeetingAvailability: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<MeetingAvailabilityBody>(req, "body");
  const availability = await meetingSchedulingService.getAvailability(input);
  const body: ApiSuccessResponse<{ availability: MeetingAvailability }> = {
    success: true,
    data: { availability },
  };

  res.status(200).json(body);
};

export const searchMeetingParticipants: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<MeetingParticipantQuery>(req, "query");
  const data: MeetingParticipantList = await meetingWorkflowService.searchParticipants(query);
  const body: ApiSuccessResponse<MeetingParticipantList> = { success: true, data };
  res.status(200).json(body);
};

export const listMyMeetings: RequestHandler = async (req, res) => {
  const meetings = await meetingWorkflowService.listMyMeetings(actorUserId(req));
  const body: ApiSuccessResponse<{ meetings: MeetingSummary[] }> = {
    success: true,
    data: { meetings },
  };
  res.status(200).json(body);
};

export const listMyMeetingRequests: RequestHandler = async (req, res) => {
  const meetings = await meetingWorkflowService.listOrganizerRequests(actorUserId(req));
  const body: ApiSuccessResponse<{ meetings: MeetingSummary[] }> = {
    success: true,
    data: { meetings },
  };
  res.status(200).json(body);
};

export const createMeetingRequest: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateMeetingBody>(req, "body");
  const meeting = await meetingWorkflowService.createRequest(actorUserId(req), input);
  const body: ApiSuccessResponse<{ meeting: MeetingSummary }> = {
    success: true,
    data: { meeting },
  };
  res.status(201).json(body);
};

export const createDirectMeeting: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateMeetingBody>(req, "body");
  const meeting = await meetingWorkflowService.createDirect(actorUserId(req), input);
  const body: ApiSuccessResponse<{ meeting: MeetingSummary }> = {
    success: true,
    data: { meeting },
  };
  res.status(201).json(body);
};

export const listCoordinatorMeetingQueue: RequestHandler = async (_req, res) => {
  const meetings = await meetingWorkflowService.listCoordinatorQueue();
  const body: ApiSuccessResponse<{ meetings: MeetingSummary[] }> = {
    success: true,
    data: { meetings },
  };
  res.status(200).json(body);
};

export const updateCoordinatorMeetingSchedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingRequestParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingScheduleBody>(req, "body");
  const meeting = await meetingWorkflowService.updateCoordinatorSchedule(
    actorUserId(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingSummary }> = {
    success: true,
    data: { meeting },
  };
  res.status(200).json(body);
};

export const updateOrganizerPendingMeetingSchedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingRequestParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingScheduleBody>(req, "body");
  const meeting = await meetingWorkflowService.updateOrganizerPendingSchedule(
    actorUserId(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingSummary }> = {
    success: true,
    data: { meeting },
  };
  res.status(200).json(body);
};

export const adjustAndApproveMeetingRequest: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingRequestParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingScheduleBody>(req, "body");
  const meeting = await meetingWorkflowService.adjustAndApproveRequest(
    actorUserId(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingSummary }> = {
    success: true,
    data: { meeting },
  };
  res.status(200).json(body);
};

export const approveMeetingRequest: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingRequestParams>(req, "params");
  const input = getValidatedRequestPart<DecideMeetingRequestBody>(req, "body");
  const meeting = await meetingWorkflowService.approveRequest(
    actorUserId(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingSummary }> = {
    success: true,
    data: { meeting },
  };
  res.status(200).json(body);
};

export const rejectMeetingRequest: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingRequestParams>(req, "params");
  const input = getValidatedRequestPart<RejectMeetingRequestBody>(req, "body");
  const meeting = await meetingWorkflowService.rejectRequest(
    actorUserId(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingSummary }> = {
    success: true,
    data: { meeting },
  };
  res.status(200).json(body);
};

export const listMeetingSchedule: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<MeetingScheduleQuery>(req, "query");
  const entries = await meetingWorkflowService.listSchedule({
    userId: actorUserId(req),
    access: currentAccess(req),
    fromAtUtc: query.fromAtUtc,
    toAtUtc: query.toAtUtc,
    ...(query.roomId === undefined ? {} : { roomId: query.roomId }),
  });
  const body: ApiSuccessResponse<{ entries: MeetingScheduleEntry[] }> = {
    success: true,
    data: { entries },
  };
  res.status(200).json(body);
};

export const getMeetingDetail: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const meeting = await meetingWorkspaceService.getDetail(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(200).json(body);
};

export const updateMeetingAgenda: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingAgendaBody>(req, "body");
  const meeting = await meetingWorkspaceService.updateAgenda(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(200).json(body);
};

export const requestMeetingReschedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<CreateMeetingRescheduleBody>(req, "body");
  const meeting = await meetingWorkspaceService.requestReschedule(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(201).json(body);
};

export const updateOrganizerMeetingReschedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<UpdateOrganizerRescheduleBody>(req, "body");
  const meeting = await meetingWorkspaceService.updateOrganizerReschedule(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(200).json(body);
};

export const cancelOrganizerMeetingReschedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<CancelMeetingRescheduleRequestBody>(req, "body");
  const meeting = await meetingWorkspaceService.cancelOrganizerRescheduleRequest(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(200).json(body);
};

export const listCoordinatorReschedules: RequestHandler = async (_req, res) => {
  const items = await meetingWorkspaceService.listPendingReschedules();
  const body: ApiSuccessResponse<{ items: MeetingRescheduleQueueItem[] }> = {
    success: true,
    data: { items },
  };
  res.status(200).json(body);
};

export const updateCoordinatorReschedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingRescheduleBody>(req, "body");
  const item = await meetingWorkspaceService.updateCoordinatorReschedule(
    actorUserId(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ item: MeetingRescheduleQueueItem }> = {
    success: true,
    data: { item },
  };
  res.status(200).json(body);
};

export const adjustAndApproveMeetingReschedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingRescheduleBody>(req, "body");
  const meeting = await meetingWorkspaceService.adjustAndApproveReschedule(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(200).json(body);
};

export const coordinatorDirectRescheduleMeeting: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<CoordinatorDirectRescheduleBody>(req, "body");
  const meeting = await meetingWorkspaceService.coordinatorDirectReschedule(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(200).json(body);
};

export const approveMeetingReschedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<DecideMeetingRescheduleBody>(req, "body");
  await meetingWorkspaceService.approveReschedule(actorUserId(req), params.meetingId, input);
  res.status(200).json({ success: true, data: { meetingId: params.meetingId } });
};

export const rejectMeetingReschedule: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<RejectMeetingRescheduleBody>(req, "body");
  await meetingWorkspaceService.rejectReschedule(actorUserId(req), params.meetingId, input);
  res.status(200).json({ success: true, data: { meetingId: params.meetingId } });
};

export const cancelMeeting: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<CancelMeetingBody>(req, "body");
  const meeting = await meetingWorkspaceService.cancelMeeting(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
    input,
  );
  const body: ApiSuccessResponse<{ meeting: MeetingDetail }> = { success: true, data: { meeting } };
  res.status(200).json(body);
};

export const listMeetingAttachments: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const items = await meetingWorkspaceService.listAttachments(
    actorUserId(req),
    currentAccess(req),
    params.meetingId,
  );
  const body: ApiSuccessResponse<{ items: MeetingAttachment[] }> = { success: true, data: { items } };
  res.status(200).json(body);
};

export const uploadMeetingAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  if (!req.file) {
    throw new AppError({
      statusCode: 400,
      code: "MEETING_ATTACHMENT_REQUIRED",
      message: "Choose a Meeting attachment to upload.",
    });
  }
  const attachment = await meetingWorkspaceService.uploadAttachment(
    actorUserId(req),
    params.meetingId,
    req.file,
  );
  const body: ApiSuccessResponse<{ attachment: MeetingAttachment }> = {
    success: true,
    data: { attachment },
  };
  res.status(201).json(body);
};

export const previewMeetingAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingAttachmentParams>(req, "params");
  const { attachment, buffer } = await meetingWorkspaceService.readAttachment(
    actorUserId(req),
    currentAccess(req),
    params.attachmentId,
  );
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`);
  res.send(buffer);
};

export const downloadMeetingAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingAttachmentParams>(req, "params");
  const { attachment, buffer } = await meetingWorkspaceService.readAttachment(
    actorUserId(req),
    currentAccess(req),
    params.attachmentId,
  );
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`);
  res.send(buffer);
};

export const removeMeetingAttachment: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingAttachmentParams>(req, "params");
  await meetingWorkspaceService.removeAttachment(actorUserId(req), params.attachmentId);
  res.status(200).json({ success: true, data: { attachmentId: params.attachmentId } });
};

export const listMeetingTemplates: RequestHandler = async (req, res) => {
  const templates = await meetingWorkspaceService.listTemplates(actorUserId(req));
  const body: ApiSuccessResponse<{ templates: MeetingTemplate[] }> = {
    success: true,
    data: { templates },
  };
  res.status(200).json(body);
};

export const createMeetingTemplate: RequestHandler = async (req, res) => {
  const input = getValidatedRequestPart<CreateMeetingTemplateBody>(req, "body");
  const template = await meetingWorkspaceService.createTemplate(actorUserId(req), input);
  const body: ApiSuccessResponse<{ template: MeetingTemplate }> = {
    success: true,
    data: { template },
  };
  res.status(201).json(body);
};

export const updateMeetingTemplate: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingTemplateParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingTemplateBody>(req, "body");
  const template = await meetingWorkspaceService.updateTemplate(
    actorUserId(req),
    params.templateId,
    input,
  );
  const body: ApiSuccessResponse<{ template: MeetingTemplate }> = {
    success: true,
    data: { template },
  };
  res.status(200).json(body);
};

export const archiveMeetingTemplate: RequestHandler = async (req, res) => {
  const params = getValidatedRequestPart<MeetingTemplateParams>(req, "params");
  const input = getValidatedRequestPart<ArchiveMeetingTemplateBody>(req, "body");
  await meetingWorkspaceService.archiveTemplate(actorUserId(req), params.templateId, input.rowVersion);
  res.status(200).json({ success: true, data: { templateId: params.templateId } });
};

