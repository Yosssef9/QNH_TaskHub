import type { DatabaseTransaction } from "../../database/types.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { hasKpiWorkCyclesAccess } from "../access-permissions/access-permissions.policy.js";
import { accessPermissionsRepository } from "../access-permissions/access-permissions.repository.js";
import { authRepository } from "../auth/auth.repository.js";
import { canReadMeetingContent } from "../meetings/meeting-content-access.js";
import { meetingWorkspaceRepository } from "../meetings/meeting-workspace.repository.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { generalTaskAssignmentsRepository } from "../general-task-assignments/general-task-assignments.repository.js";
import type { GeneralAssignmentContext } from "../general-task-assignments/general-task-assignments.repository.js";
import { shareCapabilities } from '../task-shares/task-shares.policy.js';
import { taskSharesRepository } from "../task-shares/task-shares.repository.js";
import { taskProxiesRepository, type TaskProxyGrant } from "../general-task-assignments/task-proxies.repository.js";
import { collaborationRepository } from "../collaboration/collaboration.repository.js";
import { meetingActionItemsRepository } from "./meeting-action-items.repository.js";
import type {
  MeetingActionItemCapabilities,
  MeetingActionItemContext,
} from "./meeting-action-items.types.js";

export interface ResolvedTaskAccess {
  ownerUserId: number;
  context: MeetingActionItemContext | null;
  capabilities: MeetingActionItemCapabilities;
  generalAssignment?: GeneralAssignmentContext | null;
  sharedPermission?: "VIEW" | "EDIT";
  collaborationActive?: boolean;
  proxyGrant?: TaskProxyGrant | null;
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
  canCompleteSubtasks: true, // Every child write checks effective assignee separately.
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
  const share = includeDeleted ? null : await taskSharesRepository.grant(taskId,actorUserId,transaction);
  const shareAccess = share ? {
    ownerUserId:share.ownerUserId,context:relation,sharedPermission:share.permission,
    collaborationActive:false, // overwritten below when necessary
    capabilities:shareCapabilities(share.permission),
  } : null;
  const collaborationActive = !includeDeleted && await collaborationRepository.active(taskId,transaction);
  if (collaborationActive) {
    const collaborative = await collaborationRepository.task(taskId,transaction);
    if (!collaborative) return null;
    if (actorUserId === collaborative.ownerUserId) return {
      ownerUserId: collaborative.ownerUserId,
      context: relation,
      generalAssignment: relation ? null : await generalTaskAssignmentsRepository.findContext(taskId,transaction),
      collaborationActive: true,
      capabilities: {...actionOwnerCapabilities,canCompleteTask:false,canCompleteSubtasks:false},
    };
    if (await collaborationRepository.isAssigned(taskId,actorUserId,transaction)) return {
      ownerUserId: collaborative.ownerUserId,
      context: relation,
      generalAssignment: relation ? null : await generalTaskAssignmentsRepository.findContext(taskId,transaction),
      collaborationActive: true,
      ...(shareAccess ? { sharedPermission: shareAccess.sharedPermission } : {}),
      capabilities: {...actionAssigneeCapabilities,canCompleteTask:false,
        canCompleteSubtasks:false,canChangeNonCompletionStatus:false,
        canUploadAttachments:share?.permission==='EDIT',
        ...(share?.permission==='EDIT'?{canEditDetails:true,canManageSubtasks:true}:{})},
    };
    if (shareAccess) return {...shareAccess,collaborationActive:true};
    if (!relation) return null;
    // Meeting viewers retain authorized parent context, but legacy main-assignee
    // identity must not restore execution rights after collaborative removal.
  }

  if (relation) {
    if (actorUserId === relation.ownerUserId) {
      return {
        ownerUserId: relation.ownerUserId,
        context: relation,
        capabilities: actionOwnerCapabilities,
      };
    }

    if (shareAccess) return shareAccess;
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

    const isMainAssignee = !collaborationActive && actorUserId === relation.assigneeUserId;
    const hasOwnSubtask = !collaborationActive && !isMainAssignee &&
      (await generalTaskAssignmentsRepository.visibleSubtaskIds(taskId, actorUserId, transaction)).length > 0;
    return {
      ownerUserId: relation.ownerUserId,
      context: relation,
      collaborationActive,
      capabilities: isMainAssignee ? actionAssigneeCapabilities : hasOwnSubtask
        ? { ...actionAssigneeCapabilities, canCompleteTask: false, canChangeNonCompletionStatus: false }
        : actionViewerCapabilities,
    };
  }

  // General tasks are shared only with their parent assignee or individually assigned
  // subtask executors. Meeting Action Items retain their separate access policy.
  const general = await generalTaskAssignmentsRepository.findContext(taskId, transaction);
  if (general) {
    if (general.ownerUserId === actorUserId) {
      return {
        ownerUserId: general.ownerUserId, context: null, generalAssignment: general,
        capabilities: {
          ...actionOwnerCapabilities,
          canCompleteSubtasks: true, // per-child authorization is checked separately
          canCompleteTask: general.assigneeUserId === null || general.assigneeUserId === actorUserId,
        },
      };
    }
    if (shareAccess) return shareAccess;
    if (!includeDeleted) {
      const proxies=await taskProxiesRepository.forActor(taskId,actorUserId,transaction);
      const mainProxy=proxies.find(grant=>grant.subtaskId===null);
      const childProxy=proxies.find(grant=>grant.subtaskId!==null);
      if(mainProxy || childProxy) return {
        ownerUserId:general.ownerUserId,context:null,generalAssignment:general,
        proxyGrant:mainProxy??childProxy??null,
        capabilities:{...actionAssigneeCapabilities,
          canCompleteTask:Boolean(mainProxy),canChangeNonCompletionStatus:Boolean(mainProxy)},
      };
    }
    if (includeDeleted || !(await generalTaskAssignmentsRepository.hasAccessToTask(taskId, actorUserId, transaction))) {
      return null;
    }
    const isMainAssignee = general.assigneeUserId === actorUserId;
    return {
      ownerUserId: general.ownerUserId, context: null, generalAssignment: general,
      capabilities: {
        ...actionAssigneeCapabilities,
        canCompleteTask: isMainAssignee,
        canChangeNonCompletionStatus: isMainAssignee,
        ...(share?.permission==='EDIT'?{canEditDetails:true,canManageSubtasks:true}:{})
      },
    };
  }

  if (shareAccess) return shareAccess;

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






