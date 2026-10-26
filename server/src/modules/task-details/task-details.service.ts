import path from "node:path";
import { cleanUploadedAttachmentFileName } from "../../shared/utils/attachment-filename.js";

import { withTransaction } from "../../database/transaction.js";
import { sql } from "../../database/sql.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import { resolveTaskAccess } from "../meeting-action-items/meeting-action-items.access.js";
import { meetingActionItemsRepository } from "../meeting-action-items/meeting-action-items.repository.js";
import { generalTaskAssignmentsRepository } from "../general-task-assignments/general-task-assignments.repository.js";
import { reconcileParentCompletion } from "../general-task-assignments/general-task-assignments.completion.js";
import { notifyGeneralTask } from "../general-task-assignments/general-task-assignments.email-events.js";
import { collaborationRepository } from "../collaboration/collaboration.repository.js";
import { canViewCollaborativeActivity } from "./task-activity-visibility.js";
import { mapTask } from "../tasks/tasks.mapper.js";
import { assertTaskWritable } from "../tasks/tasks.policy.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { readAttachment, removeStoredAttachment, storeAttachment } from "./attachment-storage.js";
import { mapActivity, mapAttachment, mapSubtask } from "./task-details.mapper.js";
import { taskDetailsRepository } from "./task-details.repository.js";
import type { TaskDetails } from "./task-details.types.js";
import type { CreateSubtaskBody, UpdateSubtaskBody } from "./task-details.schemas.js";
import { normalizeCollaborators } from "../collaboration/collaboration.policy.js";

const notFound = () =>
  new AppError({ statusCode: 404, code: "TASK_NOT_FOUND", message: "Task not found." });
const subtaskNotFound = () =>
  new AppError({ statusCode: 404, code: "SUBTASK_NOT_FOUND", message: "Subtask not found." });
const attachmentNotFound = () =>
  new AppError({ statusCode: 404, code: "ATTACHMENT_NOT_FOUND", message: "Attachment not found." });

function mayDeleteAttachment(
  access: NonNullable<Awaited<ReturnType<typeof resolveTaskAccess>>>,
  actorUserId: number,
  uploadedByUserId: number,
): boolean {
  // Being a historical uploader is not authority after reassignment. A VIEWER
  // must not regain mutation rights through the old delete-own-upload shortcut.
  return access.capabilities.canDeleteAnyAttachment || (
    access.capabilities.role === "ASSIGNEE" && uploadedByUserId === actorUserId
  );
}


async function assertSubtaskDueDateAllowed(
  ownerUserId: number,
  task: { kpiInstanceId: number | null },
  dueDate: string | null,
): Promise<void> {
  if (task.kpiInstanceId === null) return;

  const kpi = await workCyclesService.getInstance(ownerUserId, task.kpiInstanceId);

  if (kpi.taskPolicy.subtaskDueDateMode === "REQUIRED" && !dueDate) {
    throw new AppError({
      statusCode: 400,
      code: "KPI_SUBTASK_DUE_DATE_REQUIRED",
      message: "This KPI requires a due date for every subtask.",
    });
  }
}

async function assertTask(ownerUserId: number, taskId: number) {
  const task = await tasksRepository.findOwnedById(
    ownerUserId,
    taskId,
    getCurrentDateInAppTimeZone(),
  );
  if (!task) throw notFound();
  return task;
}

export const taskDetailsService = {
  async get(actorUserId: number, taskId: number): Promise<TaskDetails> {
    const resolved = await resolveTaskAccess(actorUserId, taskId);
    if (!resolved) throw notFound();
    const task = await assertTask(resolved.ownerUserId, taskId);
    const [subtasks, attachments, activity] = await Promise.all([
      taskDetailsRepository.listSubtasks(resolved.ownerUserId, taskId),
      taskDetailsRepository.listAttachments(resolved.ownerUserId, taskId),
      taskDetailsRepository.listActivity(resolved.ownerUserId, taskId),
    ]);
    const completed = subtasks.filter((item) => item.isCompleted).length;
    const externalShare = Boolean(resolved.sharedPermission && actorUserId !== resolved.ownerUserId);
    const isRestricted = (!!resolved.generalAssignment || !!resolved.context) && actorUserId !== resolved.ownerUserId;
    const ownIds = isRestricted && !externalShare ? new Set(resolved.collaborationActive
      ? await collaborationRepository.visibleChildIds(taskId,actorUserId)
      : await generalTaskAssignmentsRepository.visibleSubtaskIds(taskId, actorUserId)) : null;
    const visibleSubtasks = ownIds ? subtasks.filter(item => ownIds.has(Number(item.id))) : subtasks;
    const visibleAttachments = externalShare
      ? attachments.filter(item=>item.subtaskId===null) : ownIds ? attachments.filter(item => item.subtaskId === null ||
      (!resolved.collaborationActive && ownIds.has(Number(item.subtaskId)))) : attachments;
    const visibleActivity = externalShare
      ? activity.filter(item=>['CREATED','STATUS_CHANGED','COLLAB_PARENT_STATUS_CHANGED','SUBTASK_CREATED',
          'SUBTASK_UPDATED','SUBTASK_DELETED'].includes(item.activityType))
      : resolved.collaborationActive && isRestricted
      ? activity.filter(item => canViewCollaborativeActivity(item,actorUserId,ownIds ?? new Set<number>()))
      : ownIds ? activity.filter(item => {
      // List/detail/change history about sibling subtasks is never returned to another executor.
      if (item.activityType === "SUBTASKS_REORDERED") return false;
      if (item.activityType === "GENERAL_SUBTASK_ASSIGNED" || item.activityType === "MEETING_ACTION_ITEM_REASSIGNED") return false;
      if (item.activityType.startsWith("SUBTASK") || item.activityType === "ATTACHMENT_ADDED" ||
          item.activityType === "ATTACHMENT_REMOVED") {
        let event: Record<string, unknown> | null = null;
        try { event = item.eventDataJson ? JSON.parse(item.eventDataJson) as Record<string, unknown> : null; }
        catch { return false; }
        if (event?.subtaskId !== undefined && event.subtaskId !== null) {
          return ownIds.has(Number(event.subtaskId));
        }
        // Only an explicitly parent-level attachment event can be shared. Missing
        // subtask identity in legacy events is ambiguous and must stay private.
        return item.activityType === "ATTACHMENT_ADDED" && event?.subtaskId === null;
      }
      return ["STATUS_CHANGED","CREATED","COMPLETION_SUMMARY_UPDATED","GENERAL_TASK_ASSIGNED"].includes(item.activityType);
    }) : activity;
    const mappedTask = mapTask(task);
    return {
      task: {
        ...mappedTask,
        ...(isRestricted || externalShare ? {listId:null,groupId:null} : {}),
        isReadOnly: mappedTask.isReadOnly || !resolved.capabilities.canEditDetails,
        ...(resolved.collaborationActive && isRestricted || externalShare ? {completionSummary:null} : {}),
        // Authorized Meeting viewers may read parent context, not the team roster.
        ...(resolved.capabilities.role === 'VIEWER' ? {teamRoster: []} : {}),
      },
      collaborationActive: resolved.collaborationActive ?? false,
      ...(resolved.sharedPermission?{sharedPermission:resolved.sharedPermission}:{}),
      actionItem: resolved.context,
      generalAssignment: resolved.generalAssignment ?? null,
      capabilities: resolved.capabilities,
      subtasks: visibleSubtasks.map(subtask => ({...mapSubtask(subtask),
        ...(externalShare ? { assigneeUserId: null } : {}),
        ...(resolved.collaborationActive && isRestricted || externalShare ? {workNotes:null} : {})})),
      attachments: visibleAttachments.map(mapAttachment),
      activity: visibleActivity.map(mapActivity),
      progress: {
        completed,
        total: subtasks.length,
        percentage: subtasks.length ? Math.round((completed / subtasks.length) * 100) : 0,
      },
    };
  },

  async createSubtask(
    actorUserId: number,
    taskId: number,
    input: CreateSubtaskBody,
  ) {
    let ownerUserId = actorUserId;
    const id = await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw notFound();
      if (access.sharedPermission || !access.capabilities.canManageSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "You cannot create, edit, or delete subtasks for this Task.",
        });
      }
      ownerUserId = access.ownerUserId;
      const task = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, taskId);
      if (!task) throw notFound();
      assertTaskWritable(task);

      const dueDate = input.dueDate ?? null;
      await assertSubtaskDueDateAllowed(ownerUserId, task, dueDate);
      const description = input.description?.trim() || null;
      const priority = input.priority ?? mapTask(task).priority;
      const mode = input.assignmentMode ?? 'INHERIT';
      const selected = normalizeCollaborators(input.assigneeUserIds ?? []);
      if (access.collaborationActive) {
        if (input.assigneeUserId != null) throw new AppError({statusCode:400,
          code:'COLLABORATION_USE_TEAM',message:'Use the team picker for collaborative subtasks.'});
        if (mode === 'CUSTOM' && (selected.length < 1 || selected.length > 30))
          throw new AppError({statusCode:400,code:'COLLABORATION_TEAM_SIZE',
            message:'Select between 1 and 30 subtask assignees.'});
        if (mode === 'INHERIT' && selected.length) throw new AppError({statusCode:400,
          code:'COLLABORATION_INHERIT_USERS',message:'Inherited subtasks cannot specify a custom team.'});
        if (mode === 'INHERIT' && !(await collaborationRepository.activeAssignments(taskId,transaction))
            .some(member => member.subtaskId === null))
          throw new AppError({statusCode:400,code:'COLLABORATION_MAIN_TEAM_EMPTY',
            message:'The main task has no assigned team. Choose specific users for this subtask.'});
        if (mode === 'CUSTOM') for (const userId of selected) {
          if (!(await collaborationRepository.activeUser(userId,transaction)) ||
              (access.context && !(await collaborationRepository.meetingEligible(userId,
                access.context.meetingId,access.context.organizerUserId,transaction))))
            throw new AppError({statusCode:400,code:'COLLABORATION_ASSIGNEE_INVALID',
              message:'Select eligible active TaskHub users for this subtask.'});
        }
      } else {
        if (selected.length > 1) throw new AppError({statusCode:409,
          code:'COLLABORATION_MAIN_TEAM_REQUIRED',
          message:'Enable collaborative assignments on the main task before choosing multiple subtask assignees.'});
        if (mode === 'INHERIT' && selected.length) throw new AppError({statusCode:400,
          code:'COLLABORATION_INHERIT_USERS',message:'Inherited subtasks cannot specify a custom team.'});
        if (mode === 'CUSTOM' && selected.length === 0) throw new AppError({statusCode:400,
          code:'SUBTASK_ASSIGNEE_REQUIRED',message:'Select at least one assignee for a custom team.'});
      }
      const legacyAssignee = !access.collaborationActive
        ? (mode === 'CUSTOM' ? (selected[0] ?? null) : (input.assigneeUserId ?? null))
        : null;
      if (legacyAssignee !== null && (task.kpiInstanceId !== null ||
          !(access.context
            ? await meetingActionItemsRepository.eligibleAssignee(transaction,
                access.context.meetingId,access.context.organizerUserId,legacyAssignee)
            : await generalTaskAssignmentsRepository.isEligibleUser(legacyAssignee,transaction))))
        throw new AppError({statusCode:400,code:'SUBTASK_ASSIGNEE_INVALID',
          message:'Individual subtask assignment requires an active eligible user.'});

      const created = await taskDetailsRepository.createSubtask(
        transaction, ownerUserId, taskId, input.title, dueDate, description, priority,
      );
      if (!created) throw new AppError({statusCode:500,code:'SUBTASK_CREATE_FAILED',
        message:'Subtask could not be created.'});

      if (legacyAssignee !== null) {
        if (!access.context) await generalTaskAssignmentsRepository.ensureRelation(
          transaction,taskId,ownerUserId,actorUserId,null);
        await generalTaskAssignmentsRepository.setSubtaskAssignee(
          transaction,ownerUserId,created,legacyAssignee);
        await notifyGeneralTask(transaction,[legacyAssignee],actorUserId,{
          type:'GENERAL_SUBTASK_ASSIGNED',taskId,subtaskId:created,
          listId:access.context?null:task.listId,subjectTitle:task.title,
          contextTitle:access.context?.meetingTitle??'Subtask assigned to you',
        });
      }
      if (access.collaborationActive) {
        await collaborationRepository.ensureChildModes(taskId,actorUserId,transaction);
        if (mode === 'CUSTOM') {
          await collaborationRepository.setChildMode(taskId,created,actorUserId,'CUSTOM',transaction);
          await tasksRepository.addActivity(transaction,ownerUserId,taskId,'COLLAB_TEAM_MODE_CHANGED',
            {subtaskId:created,subtaskTitle:input.title,from:'INHERIT',to:'CUSTOM'},actorUserId);
        }
        const current = await collaborationRepository.activeAssignments(taskId,transaction);
        const assignees = mode === 'CUSTOM' ? selected
          : current.filter(item=>item.subtaskId===null).map(item=>item.assigneeUserId);
        for (const userId of assignees) {
          await collaborationRepository.addAssignment(taskId,created,userId,
            mode === 'CUSTOM' ? 'EXPLICIT' : 'INHERITED',actorUserId,transaction);
          await notifyGeneralTask(transaction,[userId],actorUserId,{
            type:'GENERAL_SUBTASK_ASSIGNED',taskId,subtaskId:created,
            listId:access.context?null:task.listId,subjectTitle:task.title,
            contextTitle:access.context?.meetingTitle??'Subtask assigned to you',
          });
        }
        await collaborationRepository.syncChildStatus(taskId,transaction,actorUserId);
        await collaborationRepository.syncParentStatus(taskId,transaction,actorUserId);
      } else await reconcileParentCompletion(transaction, task, ownerUserId, taskId, actorUserId);
      await tasksRepository.addActivity(
        transaction, ownerUserId, taskId, "SUBTASK_CREATED",
        { subtaskId: created, subtaskTitle: input.title, title: input.title,
          priority, hasDescription: Boolean(description), assignmentMode: access.collaborationActive ? mode : null }, actorUserId,
      );
      return created;
    });
    const subtask = await taskDetailsRepository.findSubtask(ownerUserId, id);
    if (!subtask) throw subtaskNotFound();
    return mapSubtask(subtask);
  },

  async updateSubtask(
    actorUserId: number,
    subtaskId: number,
    input: UpdateSubtaskBody,
  ) {
    const link = await taskDetailsRepository.findSubtaskAccess(subtaskId);
    if (!link) throw subtaskNotFound();
    let ownerUserId = actorUserId;
    const taskId = await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, link.taskId, false, transaction);
      if (!access) throw subtaskNotFound();
      if (!access.capabilities.canManageSubtasks ||
          (access.sharedPermission && ('assigneeUserId' in input || 'assigneeUserIds' in input || 'assignmentMode' in input))) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "You cannot create, edit, or delete subtasks for this Task.",
        });
      }
      ownerUserId = access.ownerUserId;
      const current = await taskDetailsRepository.findSubtask(ownerUserId, subtaskId, transaction);
      if (!current) throw subtaskNotFound();
      const task = await tasksRepository.findOwnedForUpdate(
        transaction, ownerUserId, Number(current.taskId),
      );
      if (!task) throw notFound();
      assertTaskWritable(task);

      const dueDate = input.dueDate !== undefined
        ? input.dueDate
        : (current.dueDate?.toISOString().slice(0, 10) ?? null);
      await assertSubtaskDueDateAllowed(ownerUserId, task, dueDate);
      const description = input.description !== undefined ? input.description?.trim() || null : current.description;
      const priority = input.priority ?? current.priority;
      await taskDetailsRepository.updateSubtask(
        transaction, ownerUserId, subtaskId, input.title ?? current.title, dueDate,
        description, priority,
      );
      await tasksRepository.addActivity(
        transaction, ownerUserId, Number(current.taskId), "SUBTASK_UPDATED",
        { subtaskId, subtaskTitle: current.title, oldTitle: current.title, newTitle: input.title ?? current.title, oldDueDate: current.dueDate?.toISOString().slice(0,10) ?? null, newDueDate: dueDate,
          oldPriority: current.priority, newPriority: priority,
          descriptionChanged: description !== current.description }, actorUserId,
      );
      if (access.collaborationActive && dueDate !== (current.dueDate?.toISOString().slice(0, 10) ?? null)) {
        const collaborators = (await collaborationRepository.activeAssignments(Number(current.taskId),transaction))
          .filter(member=>member.subtaskId===subtaskId).map(member=>member.assigneeUserId);
        await notifyGeneralTask(transaction,collaborators,actorUserId,{
          type:'GENERAL_SUBTASK_DUE_CHANGED',taskId:Number(current.taskId),
          listId:access.context ? null : task.listId,subtaskId,eventDate:dueDate,
          subjectTitle:task.title,contextTitle:'Subtask deadline updated',
        });
      }
      if (!access.collaborationActive && (access.generalAssignment || access.context) && dueDate !== (current.dueDate?.toISOString().slice(0, 10) ?? null)) {
        const recipient = await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(
          ownerUserId, subtaskId, transaction);
        await notifyGeneralTask(transaction, [recipient], actorUserId, {
          type: "GENERAL_SUBTASK_DUE_CHANGED", taskId: Number(current.taskId),
          listId: access.context ? null : task.listId, subtaskId, eventDate: dueDate,
          subjectTitle: task.title, contextTitle: "Subtask deadline updated",
        });
      }
      return Number(current.taskId);
    });
    const subtask = await taskDetailsRepository.findSubtask(ownerUserId, subtaskId);
    if (!subtask) throw subtaskNotFound();
    return { subtask: mapSubtask(subtask), taskId };
  },

  async completeSubtask(actorUserId: number, subtaskId: number, isCompleted: boolean) {
    const accessRow = await taskDetailsRepository.findSubtaskAccess(subtaskId);
    if (!accessRow) throw subtaskNotFound();

    return withTransaction(async (transaction) => {
      const resolved = await resolveTaskAccess(
        actorUserId,
        accessRow.taskId,
        false,
        transaction,
      );
      if (resolved?.collaborationActive) throw new AppError({statusCode:409,
        code:'COLLABORATION_INDIVIDUAL_COMPLETION',message:'Complete your individual assignment instead.'});
      if (!resolved || !resolved.capabilities.canCompleteSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_COMPLETION_FORBIDDEN",
          message: "You cannot change completion for this subtask.",
        });
      }

      if ((resolved.generalAssignment || resolved.context) &&
          (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(
            resolved.ownerUserId, subtaskId, transaction)) !== actorUserId) {
        throw new AppError({statusCode:403,code:"SUBTASK_NOT_ASSIGNED_TO_YOU",
          message:"Only your assigned subtasks can be completed."});
      }
      const current = await taskDetailsRepository.findSubtask(
        resolved.ownerUserId,
        subtaskId,
        transaction,
      );
      if (!current) throw subtaskNotFound();
      const task = await tasksRepository.findOwnedForUpdate(
        transaction,
        resolved.ownerUserId,
        Number(current.taskId),
      );
      if (!task) throw notFound();
      assertTaskWritable(task);

      if (current.isCompleted !== isCompleted) {
        await taskDetailsRepository.completeSubtask(
          transaction,
          resolved.ownerUserId,
          subtaskId,
          isCompleted,
        );
        await tasksRepository.addActivity(
          transaction,
          resolved.ownerUserId,
          Number(current.taskId),
          isCompleted ? "SUBTASK_COMPLETED" : "SUBTASK_REOPENED",
          { subtaskId, subtaskTitle: current.title },
          actorUserId,
        );
        await reconcileParentCompletion(transaction, task, resolved.ownerUserId,
          Number(current.taskId), actorUserId);
        if (isCompleted && (resolved.generalAssignment || resolved.context)) {
          const progress = await generalTaskAssignmentsRepository.countIncompleteSubtasks(
            transaction, Number(current.taskId), resolved.ownerUserId);
          if (progress.incomplete > 0) {
            await notifyGeneralTask(transaction,
              [resolved.ownerUserId, resolved.context?.assigneeUserId ?? resolved.generalAssignment?.assigneeUserId], actorUserId, {
                type: "GENERAL_SUBTASK_COMPLETED", taskId: Number(current.taskId),
                listId: task.listId, taskOwnerUserId: resolved.ownerUserId, subjectTitle: task.title,
                contextTitle: "A subtask was completed",
              });
          }
        }
      }
      return Number(current.taskId);
    });
  },

  async deleteSubtask(actorUserId: number, subtaskId: number) {
    const link = await taskDetailsRepository.findSubtaskAccess(subtaskId);
    if (!link) throw subtaskNotFound();
    return withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, link.taskId, false, transaction);
      if (!access) throw subtaskNotFound();
      if (access.sharedPermission || !access.capabilities.canManageSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "You cannot create, edit, or delete subtasks for this Task.",
        });
      }
      const current = await taskDetailsRepository.findSubtask(
        access.ownerUserId, subtaskId, transaction,
      );
      if (!current) throw subtaskNotFound();
      const task = await tasksRepository.findOwnedForUpdate(
        transaction, access.ownerUserId, Number(current.taskId),
      );
      if (!task) throw notFound();
      assertTaskWritable(task);
      const discussion = await transaction.request().input('discussionSubtaskId',sql.BigInt,subtaskId)
        .query<{id:number}>(`SELECT TOP(1) 1 id FROM dbo.TM_task_discussion_messages
          WHERE subtask_id=@discussionSubtaskId;`);
      if (discussion.recordset.length) throw new AppError({
        statusCode:409,code:'SUBTASK_DISCUSSION_EXISTS',
        message:'This subtask has discussion history and cannot be deleted.',
      });
      await taskDetailsRepository.deleteSubtask(transaction, access.ownerUserId, subtaskId);
      if (access.collaborationActive) {
        const members=await collaborationRepository.activeAssignments(Number(current.taskId),transaction);
        for (const member of members.filter(item=>item.subtaskId===subtaskId))
          await collaborationRepository.revokeAssignment(member.id,actorUserId,transaction);
        await collaborationRepository.syncParentStatus(Number(current.taskId),transaction,actorUserId);
      } else await reconcileParentCompletion(transaction, task, access.ownerUserId, Number(current.taskId), actorUserId);
      await tasksRepository.addActivity(
        transaction, access.ownerUserId, Number(current.taskId), "SUBTASK_DELETED",
        { subtaskId, subtaskTitle: current.title, title: current.title }, actorUserId,
      );
      return Number(current.taskId);
    });
  },

  async reorder(actorUserId: number, taskId: number, ids: number[]) {
    await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw notFound();
      if (access.sharedPermission || !access.capabilities.canManageSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "You cannot reorder subtasks for this Task.",
        });
      }
      const task = await tasksRepository.findOwnedForUpdate(
        transaction, access.ownerUserId, taskId,
      );
      if (!task) throw notFound();
      assertTaskWritable(task);
      const current = await taskDetailsRepository.listSubtasks(
        access.ownerUserId, taskId, transaction,
      );
      const currentIds = current.map((item) =>
        parsePositiveIntegerId(item.id, "subtask id"),
      );
      if (
        currentIds.length !== ids.length ||
        new Set(ids).size !== ids.length ||
        currentIds.some((id) => !ids.includes(id))
      ) {
        throw new AppError({
          statusCode: 400,
          code: "SUBTASK_ORDER_INVALID",
          message: "Subtask order must contain every active subtask exactly once.",
        });
      }
      await taskDetailsRepository.reorderSubtasks(
        transaction, access.ownerUserId, taskId, ids,
      );
      await tasksRepository.addActivity(
        transaction, access.ownerUserId, taskId, "SUBTASKS_REORDERED",
        undefined, actorUserId,
      );
    });
  },

  async upload(
    actorUserId: number,
    parent: { taskId?: number; subtaskId?: number },
    file: Express.Multer.File,
  ) {
    let taskId = parent.taskId ?? null;
    if (parent.subtaskId) {
      const link = await taskDetailsRepository.findSubtaskAccess(parent.subtaskId);
      if (!link) throw subtaskNotFound();
      taskId = link.taskId;
    }
    if (!taskId) throw notFound();
    const preflight = await resolveTaskAccess(actorUserId, taskId);
    if (preflight?.collaborationActive && actorUserId !== preflight.ownerUserId &&
        !(preflight.sharedPermission==='EDIT' && parent.subtaskId==null)) throw new AppError({
      statusCode:409,code:'COLLABORATION_INDIVIDUAL_FILES',message:'Upload to your individual assignment instead.'});
    // Explicit sharing grants access to shared parent files, never to private child evidence.
    if (preflight?.sharedPermission && parent.subtaskId != null &&
        (preflight.collaborationActive ||
          (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(
            preflight.ownerUserId,parent.subtaskId)) !== actorUserId)) {
      throw new AppError({statusCode:403,code:'PRIVATE_SUBTASK_UPLOAD_FORBIDDEN',
        message:'Shared access does not permit uploading to another person’s private subtask.'});
    }
    if (!preflight || !preflight.capabilities.canUploadAttachments) {
      throw new AppError({
        statusCode: 403,
        code: "ATTACHMENT_UPLOAD_FORBIDDEN",
        message: "You cannot upload files to this Task.",
      });
    }
    if ((preflight.generalAssignment || preflight.context) && !preflight.sharedPermission && actorUserId !== preflight.ownerUserId) {
      const permitted = parent.subtaskId
        ? (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(preflight.ownerUserId, parent.subtaskId)) === actorUserId
        : (preflight.context?.assigneeUserId ?? preflight.generalAssignment?.assigneeUserId) === actorUserId;
      if (!permitted) throw new AppError({statusCode:403,code:"ATTACHMENT_UPLOAD_FORBIDDEN",
        message:"Upload only to your own assigned work."});
    }
    const task = await assertTask(preflight.ownerUserId, taskId);
    assertTaskWritable(task);
    const originalFileName = cleanUploadedAttachmentFileName(file.originalname);
    if (!originalFileName) throw new AppError({ statusCode: 400, code: "ATTACHMENT_NAME_INVALID", message: "Attachment file name is invalid." });
    const extension = path.extname(originalFileName).toLowerCase();
    const key = await storeAttachment(file.buffer, extension);
    try {
      const record = await withTransaction(async (transaction) => {
        const resolved = await resolveTaskAccess(actorUserId, taskId!, false, transaction);
        if (resolved?.sharedPermission && parent.subtaskId != null &&
            (resolved.collaborationActive ||
              (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(
                resolved.ownerUserId,parent.subtaskId,transaction)) !== actorUserId)) {
          throw new AppError({statusCode:403,code:'PRIVATE_SUBTASK_UPLOAD_FORBIDDEN',
            message:'Shared access does not permit uploading to another person’s private subtask.'});
        }
        if (!resolved || !resolved.capabilities.canUploadAttachments) {
          throw new AppError({
            statusCode: 403,
            code: "ATTACHMENT_UPLOAD_FORBIDDEN",
            message: "You cannot upload files to this Task.",
          });
        }
        if ((resolved.generalAssignment || resolved.context) && !resolved.sharedPermission && actorUserId !== resolved.ownerUserId) {
          const permitted = parent.subtaskId
            ? (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(
                resolved.ownerUserId, parent.subtaskId, transaction)) === actorUserId
            : (resolved.context?.assigneeUserId ?? resolved.generalAssignment?.assigneeUserId) === actorUserId;
          if (!permitted) throw new AppError({statusCode:403,code:"ATTACHMENT_UPLOAD_FORBIDDEN",
            message:"Upload only to your own assigned work."});
        }
        const currentTask = await tasksRepository.findOwnedForUpdate(
          transaction,
          resolved.ownerUserId,
          taskId!,
        );
        if (!currentTask) throw notFound();
        assertTaskWritable(currentTask);

        const created = await taskDetailsRepository.createAttachment(transaction, {
          ownerUserId: resolved.ownerUserId,
          uploadedByUserId: actorUserId,
          taskId: parent.taskId ?? null,
          subtaskId: parent.subtaskId ?? null,
          name: originalFileName,
          key,
          mime: file.mimetype || "application/octet-stream",
          extension,
          size: file.size,
        });
        if (!created) {
          throw new AppError({
            statusCode: 500,
            code: "ATTACHMENT_CREATE_FAILED",
            message: "Attachment could not be saved.",
          });
        }
        await tasksRepository.addActivity(
          transaction,
          resolved.ownerUserId,
          taskId!,
          "ATTACHMENT_ADDED",
          {
            attachmentId: created.id,
            fileName: originalFileName,
            subtaskId: parent.subtaskId ?? null,
            subtaskTitle: parent.subtaskId == null ? null :
              (await taskDetailsRepository.findSubtask(resolved.ownerUserId,parent.subtaskId,transaction))?.title ?? null,
          },
          actorUserId,
        );
        return created;
      });
      return mapAttachment(record);
    } catch (error) { await removeStoredAttachment(key); throw error; }
  },

  async download(actorUserId: number, id: string) {
    const accessRow = await taskDetailsRepository.findAttachmentAccess(id);
    if (!accessRow) throw attachmentNotFound();
    const resolved = await resolveTaskAccess(actorUserId, accessRow.taskId);
    if (!resolved) throw attachmentNotFound();
    if (resolved.sharedPermission && accessRow.subtaskId !== null) throw attachmentNotFound();
    if ((resolved.generalAssignment || resolved.context) && actorUserId !== resolved.ownerUserId &&
      accessRow.subtaskId !== null &&
      (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(resolved.ownerUserId, accessRow.subtaskId)) !== actorUserId) {
      throw attachmentNotFound();
    }
    if (resolved.collaborationActive && actorUserId !== resolved.ownerUserId && accessRow.subtaskId!==null)
      throw attachmentNotFound();
    const attachment = await taskDetailsRepository.findAttachment(resolved.ownerUserId, id);
    if (!attachment) throw attachmentNotFound();
    return { attachment: mapAttachment(attachment), buffer: await readAttachment(attachment.storageKey) };
  },

  async deleteAttachment(actorUserId: number, id: string) {
    const accessRow = await taskDetailsRepository.findAttachmentAccess(id);
    if (!accessRow) throw attachmentNotFound();
    const resolved = await resolveTaskAccess(actorUserId, accessRow.taskId);
    if (!resolved) throw attachmentNotFound();
    if ((resolved.generalAssignment || resolved.context) && actorUserId !== resolved.ownerUserId &&
        (accessRow.subtaskId === null
          ? (resolved.context?.assigneeUserId ?? resolved.generalAssignment?.assigneeUserId) !== actorUserId
          : (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(
              resolved.ownerUserId, accessRow.subtaskId)) !== actorUserId)) {
      throw attachmentNotFound();
    }
    if (resolved.collaborationActive && actorUserId!==resolved.ownerUserId) throw attachmentNotFound();
    const mayDelete = mayDeleteAttachment(resolved, actorUserId, accessRow.uploadedByUserId);
    if (!mayDelete) throw new AppError({ statusCode: 403, code: "ATTACHMENT_DELETE_FORBIDDEN", message: "Only the Task owner or the current assignee who uploaded the file may delete it." });
    const record = await withTransaction(async (transaction) => {
      const currentAccess = await resolveTaskAccess(
        actorUserId,
        accessRow.taskId,
        false,
        transaction,
      );
      if (!currentAccess) throw attachmentNotFound();
      if ((currentAccess.generalAssignment || currentAccess.context) && actorUserId !== currentAccess.ownerUserId &&
          (accessRow.subtaskId === null
            ? (currentAccess.context?.assigneeUserId ?? currentAccess.generalAssignment?.assigneeUserId) !== actorUserId
            : (await generalTaskAssignmentsRepository.effectiveSubtaskAssignee(
                currentAccess.ownerUserId, accessRow.subtaskId, transaction)) !== actorUserId)) {
        throw attachmentNotFound();
      }
      const canDelete = mayDeleteAttachment(
        currentAccess, actorUserId, accessRow.uploadedByUserId,
      );
      if (!canDelete) {
        throw new AppError({
          statusCode: 403,
          code: "ATTACHMENT_DELETE_FORBIDDEN",
          message: "Only the Task owner or the current assignee who uploaded the file may delete it.",
        });
      }

      const attachment = await taskDetailsRepository.findAttachment(
        currentAccess.ownerUserId,
        id,
        transaction,
      );
      if (!attachment) throw attachmentNotFound();
      const task = await tasksRepository.findOwnedForUpdate(
        transaction,
        currentAccess.ownerUserId,
        accessRow.taskId,
      );
      if (!task) throw notFound();
      assertTaskWritable(task);
      await taskDetailsRepository.deleteAttachment(
        transaction,
        currentAccess.ownerUserId,
        id,
      );
      await tasksRepository.addActivity(
        transaction,
        currentAccess.ownerUserId,
        accessRow.taskId,
        "ATTACHMENT_REMOVED",
        { attachmentId: id, fileName: attachment.originalFileName,
          subtaskId: attachment.subtaskId,
          subtaskTitle: attachment.subtaskId === null ? null :
            (await taskDetailsRepository.findSubtask(currentAccess.ownerUserId,Number(attachment.subtaskId),transaction))?.title ?? null },
        actorUserId,
      );
      return attachment;
    });
    await removeStoredAttachment(record.storageKey);
  },
};

