import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import { meetingWorkspaceRepository } from "./meeting-workspace.repository.js";
import type { MeetingAccessContext } from "./meeting-workspace.repository.js";
import { hasMeetingPermission } from "./meetings.policy.js";

export interface MeetingContentAccessContext {
  context: MeetingAccessContext;
}


export interface MeetingContentRelationship {
  organizerUserId: number;
  status: MeetingAccessContext["status"];
  isAttendee: boolean;
}

export function canReadMeetingByRelationship(
  relationship: MeetingContentRelationship,
  actorUserId: number,
  access: TaskHubAccess,
): boolean {
  if (relationship.organizerUserId === actorUserId) return true;
  if (
    relationship.isAttendee &&
    (relationship.status === "SCHEDULED" || relationship.status === "CANCELLED")
  ) {
    return true;
  }
  return hasMeetingPermission(access, "MEETING_COORDINATE");
}

export function canReadMeetingContent(
  context: MeetingAccessContext,
  actorUserId: number,
  access: TaskHubAccess,
): boolean {
  return canReadMeetingByRelationship(context, actorUserId, access);
}

export function meetingNotFoundError(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_NOT_FOUND",
    message: "Meeting was not found.",
  });
}

export async function requireMeetingContentAccess(
  actorUserId: number,
  access: TaskHubAccess,
  meetingId: number,
  transaction?: DatabaseTransaction,
): Promise<MeetingContentAccessContext> {
  const context = await meetingWorkspaceRepository.findAccessContext(
    meetingId,
    actorUserId,
    transaction,
  );
  if (!context) throw meetingNotFoundError();

  if (!canReadMeetingContent(context, actorUserId, access)) {
    throw meetingNotFoundError();
  }

  return { context };
}

