import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import type { MeetingWorkspaceParams } from "../meetings/meeting-workspace.schemas.js";
import type {
  AssignedActionItemsQuery,
  CreateMeetingActionItemBody,
  MeetingActionItemParams,
  ReassignMeetingActionItemBody,
} from "./meeting-action-items.schemas.js";
import { meetingActionItemsService } from "./meeting-action-items.service.js";

function actor(req: Request): number {
  const id = req.authContext?.user.userId;
  if (!id) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return id;
}

function currentAccess(req: Request): TaskHubAccess {
  const value = req.authContext?.access;
  if (!value) {
    throw new AppError({
      statusCode: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authenticated TaskHub access was not resolved.",
    });
  }
  return value;
}

export const listMeetingActionItems: RequestHandler = async (req, res) => {
  const { meetingId } = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  res.status(200).json({
    success: true,
    data: await meetingActionItemsService.list(actor(req), currentAccess(req), meetingId),
  });
};

export const listMeetingActionItemAssignees: RequestHandler = async (req, res) => {
  const { meetingId } = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  res.status(200).json({
    success: true,
    data: {
      items: await meetingActionItemsService.assigneeOptions(
        actor(req),
        currentAccess(req),
        meetingId,
      ),
    },
  });
};

export const createMeetingActionItem: RequestHandler = async (req, res) => {
  const { meetingId } = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<CreateMeetingActionItemBody>(req, "body");
  res.status(201).json({
    success: true,
    data: await meetingActionItemsService.create(
      actor(req),
      currentAccess(req),
      meetingId,
      input,
    ),
  });
};

export const reassignMeetingActionItem: RequestHandler = async (req, res) => {
  const { meetingId, taskId } = getValidatedRequestPart<MeetingActionItemParams>(req, "params");
  const input = getValidatedRequestPart<ReassignMeetingActionItemBody>(req, "body");
  res.status(200).json({
    success: true,
    data: await meetingActionItemsService.reassign(
      actor(req),
      currentAccess(req),
      meetingId,
      taskId,
      input,
    ),
  });
};

export const listAssignedMeetingActionItems: RequestHandler = async (req, res) => {
  const query = getValidatedRequestPart<AssignedActionItemsQuery>(req, "query");
  res.status(200).json({
    success: true,
    data: await meetingActionItemsService.assigned(actor(req), query),
  });
};
