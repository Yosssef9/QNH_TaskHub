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
