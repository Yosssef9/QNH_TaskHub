import type { DatabaseTransaction } from "../../database/types.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { hasKpiWorkCyclesAccess } from "../access-permissions/access-permissions.policy.js";
import { accessPermissionsRepository } from "../access-permissions/access-permissions.repository.js";
import { authRepository } from "../auth/auth.repository.js";
import { canReadMeetingContent } from "../meetings/meeting-content-access.js";
import { meetingWorkspaceRepository } from "../meetings/meeting-workspace.repository.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { meetingActionItemsRepository } from "./meeting-action-items.repository.js";
import type {
  MeetingActionItemCapabilities,
  MeetingActionItemContext,
} from "./meeting-action-items.types.js";

export interface ResolvedTaskAccess {
  ownerUserId: number;
  context: MeetingActionItemContext | null;
  capabilities: MeetingActionItemCapabilities;
}

const normalOwnerCapabilities: MeetingActionItemCapabilities = {
  role: "OWNER",
  canEditDetails: true,
  canManageSubtasks: true,
  canCompleteSubtasks: true,
  canUploadAttachments: true,
  canDeleteAnyAttachment: true,
  canCompleteTask: true,
  canChangeNonCompletionStatus: true,
  canDeleteRestoreTask: true,
};

const actionOwnerCapabilities: MeetingActionItemCapabilities = {
  role: "OWNER",
  canEditDetails: true,
  canManageSubtasks: true,
  canCompleteSubtasks: false,
  canUploadAttachments: true,
  canDeleteAnyAttachment: true,
  canCompleteTask: false,
  canChangeNonCompletionStatus: true,
  canDeleteRestoreTask: true,
};

const actionAssigneeCapabilities: MeetingActionItemCapabilities = {
  role: "ASSIGNEE",
  canEditDetails: false,
  canManageSubtasks: false,
  canCompleteSubtasks: true,
  canUploadAttachments: true,
  canDeleteAnyAttachment: false,
  canCompleteTask: true,
  canChangeNonCompletionStatus: true,
  canDeleteRestoreTask: false,
};

const actionViewerCapabilities: MeetingActionItemCapabilities = {
  role: "VIEWER",
  canEditDetails: false,
  canManageSubtasks: false,
  canCompleteSubtasks: false,
  canUploadAttachments: false,
  canDeleteAnyAttachment: false,
  canCompleteTask: false,
  canChangeNonCompletionStatus: false,
  canDeleteRestoreTask: false,
};

export async function resolveTaskAccess(
  actorUserId: number,
  taskId: number,
  includeDeleted = false,
  transaction?: DatabaseTransaction,
): Promise<ResolvedTaskAccess | null> {
  const relation = await meetingActionItemsRepository.findContext(taskId, transaction, includeDeleted);

  if (relation) {
    if (actorUserId === relation.ownerUserId) {
      return {
        ownerUserId: relation.ownerUserId,
        context: relation,
        capabilities: actionOwnerCapabilities,
      };
    }

    // Deleted tasks stay owner-only. Meeting visibility does not grant restore access.
    if (includeDeleted) return null;

    // Generic Task/attachment endpoints receive an actor ID, not Meeting access.
    // Resolve current grants server-side, then reuse the normal Meeting content policy.
    // ADMIN and the ability to organize other Meetings must never imply read access.
    const profile = await authRepository.findAccessProfile(actorUserId);
    if (
      !profile?.isActive ||
      (profile.roleCode !== "USER" && profile.roleCode !== "ADMIN")
    ) {
      return null;
    }
    const meeting = await meetingWorkspaceRepository.findAccessContext(
      relation.meetingId,
      actorUserId,
      transaction,
    );
    if (
      !meeting ||
      !canReadMeetingContent(meeting, actorUserId, {
        roleCode: profile.roleCode,
        permissions: [], // Meeting content uses its dedicated grants and relationships.
        meetingOrganizeEnabled: profile.meetingOrganizeEnabled === true,
        meetingCoordinateEnabled: profile.meetingCoordinateEnabled === true,
      })
    ) {
      return null;
    }

    return {
      ownerUserId: relation.ownerUserId,
      context: relation,
      capabilities:
        actorUserId === relation.assigneeUserId
          ? actionAssigneeCapabilities
          : actionViewerCapabilities,
    };
  }

  const owned = transaction
    ? await tasksRepository.findOwnedForUpdate(transaction, actorUserId, taskId, includeDeleted)
    : await tasksRepository.findOwnedById(
        actorUserId,
        taskId,
        getCurrentDateInAppTimeZone(),
        includeDeleted,
      );

  if (!owned) return null;

  if (owned.kpiInstanceId !== null) {
    const permissions = await accessPermissionsRepository.listUserPermissions(actorUserId);
    if (!hasKpiWorkCyclesAccess(permissions)) return null;
  }

  return {
    ownerUserId: actorUserId,
    context: null,
    capabilities: normalOwnerCapabilities,
  };
}


