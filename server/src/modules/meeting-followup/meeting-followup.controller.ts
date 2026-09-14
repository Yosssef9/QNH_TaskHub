import type { Request, RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import type { MeetingWorkspaceParams } from "../meetings/meeting-workspace.schemas.js";
import type {
  CreateMeetingDecisionBody,
  MeetingDecisionParams,
  SaveMeetingFollowUpNotesBody,
  UpdateMeetingDecisionBody,
} from "./meeting-followup.schemas.js";
import { meetingFollowUpService } from "./meeting-followup.service.js";

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

export const getMeetingFollowUp: RequestHandler = async (req, res) => {
  const { meetingId } = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  res.status(200).json({
    success: true,
    data: await meetingFollowUpService.get(actor(req), currentAccess(req), meetingId),
  });
};

export const listRelatedMeetings: RequestHandler = async (req, res) => {
  const { meetingId } = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  res.status(200).json({
    success: true,
    data: await meetingFollowUpService.relatedMeetings(
      actor(req),
      currentAccess(req),
      meetingId,
    ),
  });
};

export const createMeetingDecision: RequestHandler = async (req, res) => {
  const { meetingId } = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<CreateMeetingDecisionBody>(req, "body");
  res.status(201).json({
    success: true,
    data: await meetingFollowUpService.createDecision(
      actor(req),
      currentAccess(req),
      meetingId,
      input,
    ),
  });
};

export const updateMeetingDecision: RequestHandler = async (req, res) => {
  const { meetingId, decisionId } = getValidatedRequestPart<MeetingDecisionParams>(req, "params");
  const input = getValidatedRequestPart<UpdateMeetingDecisionBody>(req, "body");
  res.status(200).json({
    success: true,
    data: await meetingFollowUpService.updateDecision(
      actor(req),
      currentAccess(req),
      meetingId,
      decisionId,
      input,
    ),
  });
};

export const saveMeetingFollowUpNotes: RequestHandler = async (req, res) => {
  const { meetingId } = getValidatedRequestPart<MeetingWorkspaceParams>(req, "params");
  const input = getValidatedRequestPart<SaveMeetingFollowUpNotesBody>(req, "body");
  res.status(200).json({
    success: true,
    data: await meetingFollowUpService.saveNotes(
      actor(req),
      currentAccess(req),
      meetingId,
      input,
    ),
  });
};

