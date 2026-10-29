import { tagsService } from "../tags/tags.service.js";
import { withTransaction } from "../../database/transaction.js";
import { sql } from "../../database/sql.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { resolveKpiTaskDates } from "../kpis/kpi-task-dates.js";
import { resolveTaskAccess } from "../meeting-action-items/meeting-action-items.access.js";
import { meetingSchedulingRepository } from "../meetings/meeting-scheduling.repository.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { notifyGeneralTask } from "../general-task-assignments/general-task-assignments.email-events.js";
import { generalTaskAssignmentsRepository } from "../general-task-assignments/general-task-assignments.repository.js";
import { collaborationRepository } from "../collaboration/collaboration.repository.js";
import { initializeCollaborativeTask } from "../collaboration/collaboration.service.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import { mapTask } from "./tasks.mapper.js";
import { assertTaskStatusTransition, assertTaskWritable } from "./tasks.policy.js";
import { tasksRepository } from "./tasks.repository.js";
import { assertNormalTaskStartDateAllowed } from "./tasks.start-date.policy.js";
import { taskUpdateFieldChanges } from "./tasks.audit.js";
import type {
  ChangeTaskStatusInput,
  CreateTaskInput,
  PersonalTask,
  TaskListQuery,
  TaskListResult,
  TaskSummary,
  UpdateTaskInput,
} from "./tasks.types.js";

function notFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "TASK_NOT_FOUND",
    message: "Task not found.",
  });
}

function listNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "LIST_NOT_FOUND",
    message: "List not found.",
  });
}

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message });
}

function toDateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function assertDateRange(startDate: string | null, dueDate: string | null): void {
  if (startDate && dueDate && startDate > dueDate) {
    throw new AppError({
      statusCode: 400,
      code: "TASK_DATE_RANGE_INVALID",
      message: "Start date must not be after due date.",
    });
  }
}

async function loadTask(ownerUserId: number, taskId: number): Promise<PersonalTask> {
  const record = await tasksRepository.findOwnedById(
    ownerUserId,
    taskId,
    getCurrentDateInAppTimeZone(),
  );
  if (!record) throw notFound();
  return mapTask(record);
}

export const tasksService = {
  async list(
    ownerUserId: number,
    listId: number,
    query: TaskListQuery,
  ): Promise<TaskListResult> {
    if (!(await tasksRepository.ownedListExists(ownerUserId, listId))) throw listNotFound();

    const result = await tasksRepository.list(
      ownerUserId,
      listId,
      query,
      getCurrentDateInAppTimeZone(),
    );

    return {
      items: result.records.map(mapTask),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  },

  async summary(ownerUserId: number, listId: number): Promise<TaskSummary> {
    if (!(await tasksRepository.ownedListExists(ownerUserId, listId))) throw listNotFound();
    return tasksRepository.summary(ownerUserId, listId, getCurrentDateInAppTimeZone());
  },

  async get(actorUserId: number, taskId: number): Promise<PersonalTask> {
    const access = await resolveTaskAccess(actorUserId, taskId);
    if (!access) throw notFound();
    const task = await loadTask(access.ownerUserId, taskId);
    return {
      ...task,
      ...((access.generalAssignment || access.context || access.sharedPermission) && access.ownerUserId !== actorUserId ? {listId:null,groupId:null} : {}),
      isReadOnly: task.isReadOnly || !access.capabilities.canEditDetails,
    };
  },

  async create(ownerUserId: number, listId: number, input: CreateTaskInput): Promise<PersonalTask> {
    assertNormalTaskStartDateAllowed(input.startDate);

    const taskId = await withTransaction(async (transaction) => {
      if (!(await tasksRepository.ownedListExists(ownerUserId, listId, transaction))) {
        throw listNotFound();
      }

      if (input.groupId != null) {
        const matches = await transaction.request().input('owner', sql.Int, ownerUserId)
          .input('list', sql.BigInt, listId).input('group', sql.BigInt, input.groupId)
          .query(`SELECT TOP (1) id FROM dbo.TM_task_groups WHERE id=@group AND list_id=@list AND owner_user_id=@owner`);
        if (!matches.recordset.length) throw new AppError({statusCode:400,code:'TASK_GROUP_INVALID',message:'Selected group is not in this List.'});
      }
      const createdId = await tasksRepository.create(transaction, ownerUserId, listId, input);
      if (!createdId) {
        throw new AppError({
          statusCode: 500,
          code: "TASK_CREATE_FAILED",
          message: "Task could not be created.",
        });
      }

      if (input.assigneeUserIds?.length) {
        if (input.assigneeUserId != null) throw new AppError({statusCode:400,
          code:'COLLABORATION_ASSIGNMENT_CONFLICT',message:'Specify either assigneeUserIds or assigneeUserId.'});
        // A single selected employee is a normal assignment. Reserve collaborative
        // completion semantics for genuinely multi-person teams.
        const uniqueAssignees=[...new Set(input.assigneeUserIds)];
        if(uniqueAssignees.length===1){
          const assignee=uniqueAssignees[0]!;
          if(!(await generalTaskAssignmentsRepository.isEligibleUser(assignee,transaction)))
            throw new AppError({statusCode:400,code:'TASK_ASSIGNEE_INVALID',message:'Select an active TaskHub user.'});
          await generalTaskAssignmentsRepository.ensureRelation(transaction,createdId,ownerUserId,
            ownerUserId,assignee,true);
          await notifyGeneralTask(transaction,[assignee],ownerUserId,{
            type:'GENERAL_TASK_ASSIGNED',taskId:createdId,listId,subjectTitle:input.title,
            contextTitle:'Task assigned to you',
          });
        }else await initializeCollaborativeTask(transaction,ownerUserId,createdId,uniqueAssignees);
      } else if (input.assigneeUserId != null) {
        if (!(await generalTaskAssignmentsRepository.isEligibleUser(input.assigneeUserId, transaction))) {
          throw new AppError({statusCode:400,code:"TASK_ASSIGNEE_INVALID",message:"Select an active TaskHub user."});
        }
        await generalTaskAssignmentsRepository.ensureRelation(transaction, createdId, ownerUserId,
          ownerUserId, input.assigneeUserId, true);
        await notifyGeneralTask(transaction, [input.assigneeUserId], ownerUserId, {
          type: "GENERAL_TASK_ASSIGNED", taskId: createdId, listId,
          subjectTitle: input.title, contextTitle: "Task assigned to you",
        });
      }
      if (input.tagIds) await tagsService.replaceTaskTags(transaction,ownerUserId,createdId,input.tagIds);
      if (input.tagIds?.length) await tasksRepository.addActivity(transaction,ownerUserId,createdId,'TAGS_CHANGED',{tagIds:input.tagIds},ownerUserId);
      await tasksRepository.addActivity(transaction, ownerUserId, createdId, "CREATED", {
        listId,
        title: input.title,
      });
      return createdId;
    });

    return loadTask(ownerUserId, taskId);
  },

  async update(actorUserId: number, taskId: number, input: UpdateTaskInput): Promise<PersonalTask> {
    let ownerUserId = actorUserId;

    await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw notFound();
      ownerUserId = access.ownerUserId;

      if (!access.capabilities.canEditDetails) {
        throw forbidden(
          "TASK_EDIT_FORBIDDEN",
          "You cannot change administrative Task details.",
        );
      }

      const current = await tasksRepository.findOwnedForUpdate(
        transaction,
        ownerUserId,
        taskId,
      );
      if (!current) throw notFound();
      assertTaskWritable(current);
      if (input.groupId !== undefined && actorUserId !== ownerUserId) {
        throw forbidden('TASK_GROUP_OWNER_ONLY','Only the Task List owner can change a Task Group.');
      }
      if (input.groupId !== undefined && (current.kpiInstanceId !== null || access.context !== null)) {
        throw new AppError({statusCode:400,code:'TASK_GROUP_NOT_SUPPORTED',message:'KPI and Meeting Action Item Tasks cannot use Groups.'});
      }

      if (access.sharedPermission && (input.listId !== undefined || input.referenceDate !== undefined)) {
        throw forbidden('TASK_SHARE_SCOPE_FORBIDDEN','Shared editors cannot move tasks or change KPI metadata.');
      }
      if (current.kpiInstanceId !== null && input.listId !== undefined) {
        throw new AppError({
          statusCode: 409,
          code: "KPI_TASK_CONTAINER_IMMUTABLE",
          message: "KPI tasks cannot be moved into a normal list.",
        });
      }

      if (
        access.context !== null &&
        input.listId !== undefined &&
        input.listId !== current.listId
      ) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_ACTION_ITEM_CONTAINER_IMMUTABLE",
          message: "Meeting Action Items remain in the Organizer's My Tasks list.",
        });
      }

      if (current.kpiInstanceId === null && input.referenceDate !== undefined) {
        throw new AppError({
          statusCode: 409,
          code: "NORMAL_TASK_REFERENCE_DATE_FORBIDDEN",
          message: "Reference dates are only valid for KPI tasks.",
        });
      }

      const destinationListId = input.listId ?? current.listId;
      if (
        current.kpiInstanceId === null &&
        destinationListId !== current.listId &&
        destinationListId !== null &&
        !(await tasksRepository.ownedListExists(ownerUserId, destinationListId, transaction))
      ) {
        throw listNotFound();
      }

      let startDate: string | null;
      let dueDate: string | null;
      let referenceDate: string | null;

      if (current.kpiInstanceId !== null) {
        const kpi = await workCyclesService.getInstance(ownerUserId, current.kpiInstanceId);
        const dates = await resolveKpiTaskDates(kpi, input, {
          startDate: toDateOnly(current.startDate),
          dueDate: toDateOnly(current.dueDate),
          referenceDate: toDateOnly(current.referenceDate),
        });
        startDate = dates.startDate;
        dueDate = dates.dueDate;
        referenceDate = dates.referenceDate;
      } else {
        startDate = input.startDate !== undefined ? input.startDate : toDateOnly(current.startDate);
        dueDate = input.dueDate !== undefined ? input.dueDate : toDateOnly(current.dueDate);
        referenceDate = null;
        if (!access.context) {
          assertNormalTaskStartDateAllowed(startDate, toDateOnly(current.startDate));
        }
        assertDateRange(startDate, dueDate);
      }

      const groupId = input.groupId !== undefined ? input.groupId
        : destinationListId === current.listId ? current.groupId ?? null : null;
      if (groupId !== null) {
        const matches = await transaction.request().input('owner',sql.Int,ownerUserId)
          .input('list',sql.BigInt,destinationListId).input('group',sql.BigInt,groupId)
          .query(`SELECT TOP(1) id FROM dbo.TM_task_groups WHERE id=@group AND list_id=@list AND owner_user_id=@owner`);
        if (!matches.recordset.length) throw new AppError({statusCode:400,code:'TASK_GROUP_INVALID',message:'Selected group is not in this List.'});
      }
      await tasksRepository.update(transaction, ownerUserId, taskId, {
        listId: destinationListId,
        groupId,
        title: input.title ?? current.title,
        description: input.description !== undefined ? input.description : current.description,
        priority: input.priority ?? mapTask(current).priority,
        startDate,
        dueDate,
        referenceDate,
      });

      if (input.tagIds !== undefined) {
        await tagsService.replaceTaskTags(transaction, actorUserId, taskId, input.tagIds);
        await tasksRepository.addActivity(transaction,ownerUserId,taskId,"TAGS_CHANGED",{tagIds:input.tagIds},actorUserId);
      }
      // Audit the actual before/after values as part of the same transaction.
      // Meeting Action Item creators can correct forgotten details later, and
      // the Task history must explain each such correction.
      const changes = taskUpdateFieldChanges(
        {
          title: current.title,
          description: current.description,
          priority: mapTask(current).priority,
          startDate: toDateOnly(current.startDate),
          dueDate: toDateOnly(current.dueDate),
        },
        {
          title: input.title ?? current.title,
          description: input.description !== undefined ? input.description : current.description,
          priority: input.priority ?? mapTask(current).priority,
          startDate,
          dueDate,
        },
      );
      await tasksRepository.addActivity(
        transaction,
        ownerUserId,
        taskId,
        "UPDATED",
        { fromListId: current.listId, toListId: destinationListId, changes },
        actorUserId,
      );
      if (access.collaborationActive && dueDate !== toDateOnly(current.dueDate)) {
        const collaborators = (await collaborationRepository.activeAssignments(taskId,transaction))
          .filter(member=>member.subtaskId===null).map(member=>member.assigneeUserId);
        await notifyGeneralTask(transaction,collaborators,actorUserId,{
          type:'GENERAL_TASK_DUE_CHANGED',taskId,listId:access.context ? null : destinationListId,
          subjectTitle:input.title??current.title,contextTitle:access.context?.meetingTitle??'Task deadline updated',
          eventDate:dueDate,
        });
      }
      if (!access.collaborationActive && (access.generalAssignment || access.context) && dueDate !== toDateOnly(current.dueDate)) {
        await notifyGeneralTask(transaction, [access.context?.assigneeUserId ?? access.generalAssignment?.assigneeUserId], actorUserId, {
          type: "GENERAL_TASK_DUE_CHANGED", taskId, listId: access.context ? null : destinationListId,
          subjectTitle: input.title ?? current.title, contextTitle: access.context?.meetingTitle ?? "Task deadline updated",
          eventDate: dueDate,
        });
      }

    });

    return loadTask(ownerUserId, taskId);
  },

  async changeStatus(
    actorUserId: number,
    taskId: number,
    input: ChangeTaskStatusInput,
  ): Promise<PersonalTask> {
    let ownerUserId = actorUserId;

    await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw notFound();
      ownerUserId = access.ownerUserId;
      if (access.collaborationActive && input.status !== 'CANCELLED' &&
          !(input.status==='TODO' && access.capabilities.role==='OWNER' &&
            (await tasksRepository.findOwnedForUpdate(transaction,ownerUserId,taskId))?.status==='CANCELLED')) {
        throw new AppError({statusCode:409,code:'COLLABORATION_STATUS_AUTOMATIC',
          message:'Collaborative Task completion and reopening are calculated automatically.'});
      }

      if (access.generalAssignment && access.capabilities.role === "OWNER" &&
          access.generalAssignment.assigneeUserId !== null &&
          access.generalAssignment.assigneeUserId !== actorUserId && input.status === "DONE") {
        throw forbidden("GENERAL_TASK_OWNER_CANNOT_COMPLETE", "Only the assigned person can complete this task.");
      }
      if (access.generalAssignment && access.capabilities.role === "ASSIGNEE" &&
          input.status === "CANCELLED") {
        throw forbidden("GENERAL_TASK_ASSIGNEE_CANNOT_CANCEL", "Only the creator can cancel the task.");
      }
      if (access.context) {
        if (access.capabilities.role === "OWNER" && input.status === "DONE") {
          throw forbidden(
            "MEETING_ACTION_ITEM_OWNER_CANNOT_COMPLETE",
            "Only the assigned participant can mark this Action Item complete.",
          );
        }
        if (
          access.capabilities.role === "ASSIGNEE" &&
          input.status !== "TODO" &&
          input.status !== "IN_PROGRESS" &&
          input.status !== "DONE"
        ) {
          throw forbidden(
            "MEETING_ACTION_ITEM_ASSIGNEE_STATUS_FORBIDDEN",
            "The assignee may move the Action Item only between To Do, In Progress, and Done.",
          );
        }
      }

      // Read access is not permission to change status. A new VIEWER role must
      // not fall through the OWNER/ASSIGNEE-specific checks above.
      const canChangeStatus = input.status === "DONE"
        ? access.capabilities.canCompleteTask
        : access.capabilities.canChangeNonCompletionStatus;
      if (!canChangeStatus) {
        throw forbidden("TASK_STATUS_FORBIDDEN", "You cannot change this Task's status.");
      }

      const current = await tasksRepository.findOwnedForUpdate(
        transaction,
        ownerUserId,
        taskId,
      );
      if (!current) throw notFound();
      assertTaskWritable(current);

      if (access.generalAssignment && access.capabilities.role === "ASSIGNEE" &&
        !access.capabilities.canCompleteTask && input.status === "DONE") {
        throw forbidden("GENERAL_SUBTASK_ASSIGNEE_CANNOT_COMPLETE_MAIN",
          "Only the main task assignee can complete the parent task.");
      }
      // Existing KPI calculations retain their independent completion lifecycle.
      if (input.status === "DONE" && current.kpiInstanceId === null) {
        const progress = await generalTaskAssignmentsRepository.countIncompleteSubtasks(
          transaction, taskId, ownerUserId);
        if (progress.incomplete > 0) {
          throw new AppError({statusCode:409,code:"TASK_SUBTASKS_INCOMPLETE",
            message:`${progress.incomplete} of ${progress.total} subtasks are incomplete.`});
        }
      }
      const currentStatus = mapTask(current).status;
      assertTaskStatusTransition(currentStatus, input.status);
      if (currentStatus === input.status) return;

      await tasksRepository.changeStatus(
        transaction,
        ownerUserId,
        taskId,
        input.status,
        input.status === "CANCELLED" ? (input.cancellationReason ?? null) : null,
      );

      let proxyOfName:string|undefined;
      let proxyActorName:string|undefined;
      if(access.proxyGrant){
        const proxyActors=await transaction.request()
          .input('principal',sql.Int,access.proxyGrant.principalUserId)
          .input('actor',sql.Int,actorUserId)
          .query<{principalName:string|null;actorName:string|null}>(`
            SELECT (SELECT TOP(1) COALESCE(USER_NAME,USER_CODE) FROM dbo.users WHERE USER_ID=@principal) principalName,
                   (SELECT TOP(1) COALESCE(USER_NAME,USER_CODE) FROM dbo.users WHERE USER_ID=@actor) actorName;`);
        proxyOfName=proxyActors.recordset[0]?.principalName??undefined;
        proxyActorName=proxyActors.recordset[0]?.actorName??undefined;
      }
      await tasksRepository.addActivity(
        transaction,
        ownerUserId,
        taskId,
        "STATUS_CHANGED",
        { from: currentStatus, to: input.status,
          ...(access.proxyGrant ? {proxyOfUserId:access.proxyGrant.principalUserId,proxyOfName,
            proxyId:access.proxyGrant.id}: {}) },
        actorUserId,
      );

      if (access.collaborationActive && currentStatus === 'CANCELLED' && input.status === 'TODO') {
        await collaborationRepository.syncChildStatus(taskId,transaction,actorUserId);
        await collaborationRepository.syncParentStatus(taskId,transaction,actorUserId);
      }

      if (!access.collaborationActive && access.generalAssignment &&
          (input.status === "DONE" || (currentStatus === "DONE" &&
            (input.status === "TODO" || input.status === "IN_PROGRESS")))) {
        await notifyGeneralTask(transaction,
          [ownerUserId, access.generalAssignment.assigneeUserId], actorUserId, {
            type: input.status === "DONE" ? "GENERAL_TASK_COMPLETED" : "GENERAL_TASK_REOPENED",
            taskId, listId: current.listId, taskOwnerUserId: ownerUserId, subjectTitle: current.title,
            contextTitle: access.proxyGrant && proxyActorName && proxyOfName
              ? `${proxyActorName} (${input.status === "DONE" ? "completed" : "reopened"} as proxy for ${proxyOfName})`
              : input.status === "DONE" ? "Main task completed" : "Main task reopened",
          });
      }
      if (!access.collaborationActive && access.context && currentStatus === "DONE" && (input.status === "TODO" || input.status === "IN_PROGRESS")) {
        await notifyGeneralTask(transaction, [access.context.assigneeUserId], actorUserId, {
          type: "GENERAL_TASK_REOPENED", taskId, listId: null, taskOwnerUserId: ownerUserId,
          subjectTitle: current.title, contextTitle: access.context.meetingTitle,
        });
      }
      if (access.context) {
        await meetingSchedulingRepository.addActivity(transaction, access.context.meetingId, actorUserId,
          "ACTION_ITEM_STATUS_CHANGED", {
            taskId, taskTitle: current.title, fromTaskStatus: currentStatus, toTaskStatus: input.status,
          });
      }

      if (
        access.context &&
        access.capabilities.role === "ASSIGNEE" &&
        input.status === "DONE"
      ) {
        const eventToken =
          current.updatedAtUtc?.toISOString() ?? current.createdAtUtc.toISOString();
        await notificationsRepository.ensureMeetingActionItemNotification(
          ownerUserId,
          {
            type: "MEETING_ACTION_ITEM_COMPLETED",
            dedupeKey: `MEETING_ACTION_ITEM_COMPLETED:${taskId}:${eventToken}`,
            subjectTitle: current.title,
            contextTitle: `${access.context.assigneeName} · ${access.context.meetingTitle}`,
            taskId,
            listId: current.listId,
            meetingId: access.context.meetingId,
          },
          transaction,
        );
      }
    });

    return loadTask(ownerUserId, taskId);
  },

  async remove(actorUserId: number, taskId: number): Promise<void> {
    await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw notFound();
      if (!access.capabilities.canDeleteRestoreTask) {
        throw forbidden(
          "TASK_DELETE_FORBIDDEN",
          "You cannot delete this Task.",
        );
      }

      const current = await tasksRepository.findOwnedForUpdate(
        transaction,
        access.ownerUserId,
        taskId,
      );
      if (!current) throw notFound();
      assertTaskWritable(current);

      await tasksRepository.setDeleted(transaction, access.ownerUserId, taskId, true);
      await tasksRepository.addActivity(
        transaction,
        access.ownerUserId,
        taskId,
        "DELETED",
        undefined,
        actorUserId,
      );
    });
  },

  async restore(actorUserId: number, taskId: number): Promise<PersonalTask> {
    let ownerUserId = actorUserId;

    await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, true, transaction);
      if (!access) throw notFound();
      ownerUserId = access.ownerUserId;
      if (!access.capabilities.canDeleteRestoreTask) {
        throw forbidden(
          "TASK_RESTORE_FORBIDDEN",
          "You cannot restore this Task.",
        );
      }

      const current = await tasksRepository.findOwnedForUpdate(
        transaction,
        ownerUserId,
        taskId,
        true,
      );
      if (!current) throw notFound();
      if (!current.deletedAtUtc) return;
      assertTaskWritable(current);

      if (
        current.listId !== null &&
        !(await tasksRepository.ownedListExists(ownerUserId, current.listId, transaction))
      ) {
        throw new AppError({
          statusCode: 409,
          code: "TASK_LIST_ARCHIVED",
          message: "Restore the task's list before restoring this task.",
        });
      }

      if (
        current.kpiInstanceId !== null &&
        !(await tasksRepository.ownedKpiInstanceIsOpen(
          ownerUserId,
          current.kpiInstanceId,
          transaction,
        ))
      ) {
        throw new AppError({
          statusCode: 409,
          code: "TASK_KPI_INSTANCE_UNAVAILABLE",
          message: "This task cannot be restored because its Work Cycle is unavailable.",
        });
      }

      await tasksRepository.setDeleted(transaction, ownerUserId, taskId, false);
      await tasksRepository.addActivity(
        transaction,
        ownerUserId,
        taskId,
        "RESTORED",
        undefined,
        actorUserId,
      );
    });

    return loadTask(ownerUserId, taskId);
  },
};







