import type { Request, RequestHandler } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { ApiSuccessResponse } from "../../shared/types/result.js";
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
