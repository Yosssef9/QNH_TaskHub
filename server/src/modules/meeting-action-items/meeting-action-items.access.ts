import type { DatabaseTransaction } from "../../database/types.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { hasKpiWorkCyclesAccess } from "../access-permissions/access-permissions.policy.js";
import { accessPermissionsRepository } from "../access-permissions/access-permissions.repository.js";
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

    if (actorUserId === relation.assigneeUserId && !includeDeleted) {
      return {
        ownerUserId: relation.ownerUserId,
        context: relation,
        capabilities: actionAssigneeCapabilities,
      };
    }

    return null;
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

