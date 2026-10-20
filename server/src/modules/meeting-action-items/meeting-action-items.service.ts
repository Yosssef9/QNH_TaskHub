import { tagsService } from "../tags/tags.service.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { assertNormalTaskStartDateAllowed } from '../tasks/tasks.start-date.policy.js';
import { taskUpdateFieldChanges } from '../tasks/tasks.audit.js';
import { assertTaskWritable } from '../tasks/tasks.policy.js';
import { sql } from '../../database/sql.js';
import type { TaskHubAccess } from "../auth/auth.types.js";
import { meetingSchedulingRepository } from "../meetings/meeting-scheduling.repository.js";
import { meetingWorkspaceRepository } from "../meetings/meeting-workspace.repository.js";
import { requireMeetingContentAccess } from "../meetings/meeting-content-access.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { collaborationRepository } from "../collaboration/collaboration.repository.js";
import { initializeCollaborativeTask, setCollaborativeMainTeamInTransaction } from "../collaboration/collaboration.service.js";
import { meetingActionItemsRepository } from "./meeting-action-items.repository.js";
import type {
  AssignedMeetingActionItemListData,
  AssignedMeetingActionItemQuery,
  CreateMeetingActionItemInput,
  MeetingActionItemListData,
  ReassignMeetingActionItemInput,
  UpdateMeetingActionItemInput,
} from "./meeting-action-items.types.js";

function meetingNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_NOT_FOUND",
    message: "Meeting was not found.",
  });
}

function actionItemNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_ACTION_ITEM_NOT_FOUND",
    message: "Meeting Action Item was not found.",
  });
}

async function accessContext(actorUserId: number, access: TaskHubAccess, meetingId: number) {
  const resolved = await requireMeetingContentAccess(actorUserId, access, meetingId);
  return resolved.context;
}

async function canCreateNow(
  actorUserId: number,
  context: Awaited<ReturnType<typeof accessContext>>,
): Promise<boolean> {
  if (
    context.organizerUserId !== actorUserId ||
    context.status !== "SCHEDULED" ||
    context.currentRevisionId === null
  ) {
    return false;
  }
  const startAtUtc = await meetingWorkspaceRepository.approvedStart(
    context.meetingId,
    context.currentRevisionId,
  );
  return startAtUtc !== null && startAtUtc.getTime() <= Date.now();
}

export const meetingActionItemsService = {
  async list(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
  ): Promise<MeetingActionItemListData> {
    const context = await accessContext(actorUserId, access, meetingId);
    const [items, canCreate] = await Promise.all([
      meetingActionItemsRepository.listForMeeting(meetingId),
      canCreateNow(actorUserId, context),
    ]);
    // Meeting attendees who are not assigned to this Action Item may see its
    // shared parent context, not a detailed collaborator directory.
    const scopedItems = items.map(item => item.organizerUserId === actorUserId ||
      item.teamRoster?.some(member => member.userId === actorUserId)
      ? item
      : {...item, teamRoster: []});
    return { items: scopedItems, canCreate };
  },

  async assigneeOptions(actorUserId: number, access: TaskHubAccess, meetingId: number) {
    const context = await accessContext(actorUserId, access, meetingId);
    if (context.organizerUserId !== actorUserId) {
      throw new AppError({
        statusCode: 403,
        code: "MEETING_ORGANIZER_REQUIRED",
        message: "Only the Meeting Organizer can assign Action Items.",
      });
    }
    return meetingActionItemsRepository.listAssigneeOptions(meetingId, actorUserId);
  },

  async create(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: CreateMeetingActionItemInput,
  ) {
    const current = await accessContext(actorUserId, access, meetingId);
    if (current.organizerUserId !== actorUserId) {
      throw new AppError({
        statusCode: 403,
        code: "MEETING_ORGANIZER_REQUIRED",
        message: "Only the Meeting Organizer can create Action Items.",
      });
    }

    const taskId = await withTransaction(async (transaction) => {
      // Stable request IDs make client retries safe after an uncertain network response.
      if (input.requestId) {
        const existing = await meetingActionItemsRepository.findCreationRequest(transaction, meetingId, input.requestId);
        if (existing !== null) return existing;
      }
      await meetingWorkspaceRepository.lockMeetingForContentMutation(transaction, meetingId);
      const locked = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!locked || locked.organizerUserId !== actorUserId) throw meetingNotFound();
      if (locked.status !== "SCHEDULED" || locked.currentRevisionId === null) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_ACTION_ITEMS_NOT_AVAILABLE",
          message: "Action Items can be created only after a Meeting is scheduled.",
        });
      }

      const startAtUtc = await meetingWorkspaceRepository.approvedStart(
        meetingId,
        locked.currentRevisionId,
        transaction,
      );
      if (!startAtUtc || startAtUtc.getTime() > Date.now()) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_FOLLOWUP_NOT_STARTED",
          message: "Follow-up becomes available when the approved Meeting start time is reached.",
        });
      }

      if (
        !(await meetingActionItemsRepository.eligibleAssignee(
          transaction,
          meetingId,
          actorUserId,
          input.assigneeUserId,
        ))
      ) {
        throw new AppError({
          statusCode: 400,
          code: "MEETING_ACTION_ITEM_ASSIGNEE_INVALID",
          message: "Choose a Meeting attendee with active Portal and TaskHub access.",
        });
      }

      if (
        input.agendaItemId &&
        !(await meetingActionItemsRepository.agendaBelongsToMeeting(
          transaction,
          meetingId,
          input.agendaItemId,
        ))
      ) {
        throw new AppError({
          statusCode: 400,
          code: "MEETING_ACTION_ITEM_AGENDA_INVALID",
          message: "The selected Agenda topic does not belong to this Meeting.",
        });
      }

      const listId = await meetingActionItemsRepository.defaultListId(transaction, actorUserId);
      if (!listId) {
        throw new AppError({
          statusCode: 500,
          code: "DEFAULT_LIST_MISSING",
          message: "The Organizer's My Tasks list is unavailable.",
        });
      }

      const created = await tasksRepository.create(transaction, actorUserId, listId, input);
      if (!created) {
        throw new AppError({
          statusCode: 500,
          code: "TASK_CREATE_FAILED",
          message: "Action Item Task could not be created.",
        });
      }

      if (input.tagIds) await tagsService.replaceTaskTags(transaction,actorUserId,created,input.tagIds);
      if (input.tagIds?.length) await tasksRepository.addActivity(transaction,actorUserId,created,'TAGS_CHANGED',{tagIds:input.tagIds},actorUserId);
      const relationRowVersion = await meetingActionItemsRepository.createRelationship(
        transaction,
        {
          taskId: created,
          meetingId,
          requestId: input.requestId,
          agendaItemId: input.agendaItemId ?? null,
          assigneeUserId: input.assigneeUserId,
          assignedByUserId: actorUserId,
        },
      );

      await tasksRepository.addActivity(
        transaction,
        actorUserId,
        created,
        "MEETING_ACTION_ITEM_CREATED",
        {
          meetingId,
          assigneeUserId: input.assigneeUserId,
          agendaItemId: input.agendaItemId ?? null,
        },
        actorUserId,
      );

      await meetingSchedulingRepository.addActivity(transaction, meetingId, actorUserId,
        "ACTION_ITEM_CREATED", {
          taskId: created, taskTitle: input.title,
          assigneeUserId: input.assigneeUserId, agendaItemId: input.agendaItemId ?? null,
        });

      if (input.assigneeUserIds?.length) {
        if (!input.assigneeUserIds.includes(input.assigneeUserId)) throw new AppError({
          statusCode:400,code:'COLLABORATION_MEETING_ASSIGNEE_INVALID',
          message:'The initial assignee must be one of the selected assignees.',
        });
        await initializeCollaborativeTask(transaction,actorUserId,created,input.assigneeUserIds);
      }

      const sourceMeetingTitle =
        (await meetingActionItemsRepository.meetingTitle(meetingId, transaction)) ?? "Meeting";
      if (!input.assigneeUserIds?.length) await notificationsRepository.ensureMeetingActionItemNotification(
        input.assigneeUserId,
        {
          type: "MEETING_ACTION_ITEM_ASSIGNED",
          dedupeKey: `MEETING_ACTION_ITEM_ASSIGNED:${created}:${input.assigneeUserId}:${relationRowVersion}`,
          subjectTitle: input.title,
          contextTitle: sourceMeetingTitle,
          taskId: created,
          meetingId,
        },
        transaction,
      );

      return created;
    });

    const items = await meetingActionItemsRepository.listForMeeting(meetingId);
    const item = items.find((candidate) => candidate.taskId === taskId);
    if (!item) throw actionItemNotFound();
    return { item };
  },

  async update(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    taskId: number,
    input: UpdateMeetingActionItemInput,
  ) {
    await accessContext(actorUserId, access, meetingId);
    await withTransaction(async transaction => {
      await meetingWorkspaceRepository.lockMeetingForContentMutation(transaction, meetingId);
      const relation = await meetingActionItemsRepository.findContext(taskId, transaction);
      // The actual task creator is its immutable owner; being a Meeting attendee
      // or holding Coordinator permission does not grant permission to edit it.
      if (!relation || relation.meetingId !== meetingId) throw actionItemNotFound();
      if (relation.ownerUserId !== actorUserId) throw new AppError({statusCode:403,
        code:'MEETING_ACTION_ITEM_CREATOR_REQUIRED',message:'Only the Action Item creator may edit it.'});
      const task = await tasksRepository.findOwnedForUpdate(transaction, relation.ownerUserId, taskId);
      if (!task) throw actionItemNotFound();
      assertTaskWritable(task);
      if (task.status === 'CANCELLED') throw new AppError({statusCode:409,
        code:'MEETING_ACTION_ITEM_CANCELLED',message:'Restore the Action Item before editing.'});
      const validIds = [...new Set(input.assigneeUserIds)];
      if (validIds.length !== input.assigneeUserIds.length) throw new AppError({statusCode:400,
        code:'MEETING_ACTION_ITEM_DUPLICATE_ASSIGNEE',message:'Each employee can be selected once.'});
      for (const id of validIds) {
        if (!(await meetingActionItemsRepository.eligibleAssignee(transaction,meetingId,actorUserId,id))) {
          throw new AppError({statusCode:400,code:'MEETING_ACTION_ITEM_ASSIGNEE_INVALID',
            message:'Select active, eligible Meeting participants.'});
        }
      }
      if (input.agendaItemId !== null && !(await meetingActionItemsRepository.agendaBelongsToMeeting(
        transaction,meetingId,input.agendaItemId))) throw new AppError({statusCode:400,
        code:'MEETING_ACTION_ITEM_AGENDA_INVALID',message:'Agenda topic is not part of this Meeting.'});
      const startDate = input.startDate ?? null;
      const dueDate = input.dueDate ?? null;
      const previousStart = task.startDate?.toISOString().slice(0,10) ?? null;
      const previousDue = task.dueDate?.toISOString().slice(0,10) ?? null;
      assertNormalTaskStartDateAllowed(startDate, previousStart);
      if (startDate && dueDate && startDate > dueDate) throw new AppError({statusCode:400,
        code:'TASK_DATE_RANGE_INVALID',message:'Start date must not be after due date.'});
      const previousMembers = (await collaborationRepository.activeAssignments(taskId,transaction))
        .filter(member => member.subtaskId === null).map(member => member.assigneeUserId);
      const previousTeam = previousMembers.length ? previousMembers : [relation.assigneeUserId];
      const changedTeam = previousTeam.length !== validIds.length ||
        previousTeam.some(id => !validIds.includes(id));
      const nextPrimary = validIds.includes(relation.assigneeUserId) ? relation.assigneeUserId : validIds[0]!;
      const relationChanged = changedTeam || relation.agendaItemId !== input.agendaItemId;
      const changes: Array<{field:string;from:string|null;to:string|null}> = taskUpdateFieldChanges({
        title:task.title,description:task.description,priority:task.priority,
        startDate:previousStart,dueDate:previousDue,
      },{
        title:input.title,description:input.description,priority:input.priority,
        startDate,dueDate,
      });
      const priorTags = await transaction.request().input('taskId',sql.BigInt,taskId)
        .query<{id:number|string}>(`SELECT tag_id AS id FROM dbo.TM_task_tags WHERE task_id=@taskId ORDER BY tag_id`);
      const beforeTags=priorTags.recordset.map(row=>Number(row.id)).sort((a,b)=>a-b);
      const afterTags=[...input.tagIds].sort((a,b)=>a-b);
      const changedTags=JSON.stringify(beforeTags)!==JSON.stringify(afterTags);
      if (changes.length===0 && !relationChanged && !changedTags) return;
      // Persist the old/new display values in the immutable event payload. It
      // must remain intelligible even if staff names or Agenda topics change.
      if (relation.agendaItemId !== input.agendaItemId) {
        const nextAgenda = input.agendaItemId === null ? null : await transaction.request()
          .input('agendaId',sql.BigInt,input.agendaItemId)
          .query<{topic:string}>(`SELECT TOP (1) topic FROM dbo.TM_meeting_agenda_items WHERE id=@agendaId`);
        changes.push({field:'agendaItemId',from:relation.agendaTitle,to:nextAgenda?.recordset[0]?.topic ?? null});
      }
      if (changedTeam) {
        const people = await transaction.request()
          .input('ids',sql.NVarChar(sql.MAX),JSON.stringify([...new Set([...previousTeam,...validIds])]))
          .query<{id:number;name:string}>(`SELECT USER_ID AS id, USER_NAME AS name
            FROM dbo.users WHERE USER_ID IN (SELECT TRY_CONVERT(INT,value) FROM OPENJSON(@ids))`);
        const names = new Map(people.recordset.map(row=>[Number(row.id),row.name]));
        const describe = (ids:number[])=>ids.map(id=>names.get(id) ?? String(id)).join(', ');
        changes.push({field:'assigneeUserIds',from:describe(previousTeam),to:describe(validIds)});
      }
      if (changedTags) changes.push({field:'tagIds',
        from:beforeTags.join(', ') || null,to:afterTags.join(', ') || null});
      const nextVersion = await meetingActionItemsRepository.updateRelationship(
        transaction,taskId,meetingId,input.agendaItemId,nextPrimary,actorUserId,
        input.rowVersion,changedTeam,
      );
      if (!nextVersion) throw new AppError({statusCode:409,code:'STALE_MEETING_ACTION_ITEM',
        message:'Another user has changed this Action Item. Reload and try again.'});
      if (changes.length) {
        await tasksRepository.update(transaction,actorUserId,taskId,{
          listId:task.listId,groupId:task.groupId ?? null,title:input.title,
          description:input.description,priority:input.priority,startDate,dueDate,referenceDate:null,
        });
        await tasksRepository.addActivity(transaction,actorUserId,taskId,'UPDATED',
          {fromListId:task.listId,toListId:task.listId,changes},actorUserId);
      }
      if (changedTags) {
        await tagsService.replaceTaskTags(transaction,actorUserId,taskId,afterTags);
        await tasksRepository.addActivity(transaction,actorUserId,taskId,'TAGS_CHANGED',
          {fromTagIds:beforeTags,toTagIds:afterTags},actorUserId);
      }
      if (changedTeam) {
        if (previousMembers.length || validIds.length > 1) {
          await setCollaborativeMainTeamInTransaction(actorUserId,taskId,validIds,transaction);
        } else {
          await notificationsRepository.ensureMeetingActionItemNotification(nextPrimary,{
            type:'MEETING_ACTION_ITEM_ASSIGNED',
            dedupeKey:`MEETING_ACTION_ITEM_ASSIGNED:${taskId}:${nextPrimary}:${nextVersion}`,
            subjectTitle:input.title,contextTitle:relation.meetingTitle,taskId,meetingId,
          },transaction);
        }
        await tasksRepository.addActivity(transaction,actorUserId,taskId,'MEETING_ACTION_ITEM_REASSIGNED',
          {meetingId,fromAssigneeUserIds:previousTeam,toAssigneeUserIds:validIds},actorUserId);
      }
      if (relation.agendaItemId !== input.agendaItemId) {
        await tasksRepository.addActivity(transaction,actorUserId,taskId,'MEETING_ACTION_ITEM_AGENDA_CHANGED',
          {meetingId,from:relation.agendaItemId,to:input.agendaItemId},actorUserId);
      }
      await meetingSchedulingRepository.addActivity(transaction,meetingId,actorUserId,'ACTION_ITEM_UPDATED',{
        taskId,changes,changedTeam,changedTags,
        fromAgendaItemId:relation.agendaItemId,toAgendaItemId:input.agendaItemId,
      });
    });
    const item=(await meetingActionItemsRepository.listForMeeting(meetingId)).find(row=>row.taskId===taskId);
    if (!item) throw actionItemNotFound();
    return {item};
  },

  async reassign(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    taskId: number,
    input: ReassignMeetingActionItemInput,
  ) {
    const current = await accessContext(actorUserId, access, meetingId);
    if (current.organizerUserId !== actorUserId) {
      throw new AppError({
        statusCode: 403,
        code: "MEETING_ORGANIZER_REQUIRED",
        message: "Only the Meeting Organizer can reassign Action Items.",
      });
    }

    await withTransaction(async (transaction) => {
      await meetingWorkspaceRepository.lockMeetingForContentMutation(transaction, meetingId);
      const relation = await meetingActionItemsRepository.findContext(taskId, transaction);
      if (!relation || relation.meetingId !== meetingId || relation.ownerUserId !== actorUserId) {
        throw actionItemNotFound();
      }

      if (await collaborationRepository.active(taskId,transaction)) throw new AppError({statusCode:409,
        code:'COLLABORATION_USE_TEAM',message:'Manage the collaborative team instead.'});
      if (relation.assigneeUserId === input.assigneeUserId) return;

      if (
        !(await meetingActionItemsRepository.eligibleAssignee(
          transaction,
          meetingId,
          actorUserId,
          input.assigneeUserId,
        ))
      ) {
        throw new AppError({
          statusCode: 400,
          code: "MEETING_ACTION_ITEM_ASSIGNEE_INVALID",
          message: "Choose a Meeting attendee with active Portal and TaskHub access.",
        });
      }

      const nextRowVersion = await meetingActionItemsRepository.updateAssignee(
        transaction,
        taskId,
        input.assigneeUserId,
        actorUserId,
        input.rowVersion,
      );
      if (!nextRowVersion) {
        throw new AppError({
          statusCode: 409,
          code: "STALE_MEETING_ACTION_ITEM",
          message: "This Action Item was changed by another user. Refresh and try again.",
        });
      }

      await tasksRepository.addActivity(
        transaction,
        actorUserId,
        taskId,
        "MEETING_ACTION_ITEM_REASSIGNED",
        {
          meetingId,
          fromAssigneeUserId: relation.assigneeUserId,
          toAssigneeUserId: input.assigneeUserId,
        },
        actorUserId,
      );

      const task = await tasksRepository.findOwnedForUpdate(transaction, actorUserId, taskId);
      if (!task) throw actionItemNotFound();
      await meetingSchedulingRepository.addActivity(transaction, meetingId, actorUserId,
        "ACTION_ITEM_REASSIGNED", {
          taskId, taskTitle: task.title,
          fromAssigneeUserId: relation.assigneeUserId, toAssigneeUserId: input.assigneeUserId,
        });
      await notificationsRepository.ensureMeetingActionItemNotification(
        input.assigneeUserId,
        {
          type: "MEETING_ACTION_ITEM_ASSIGNED",
          dedupeKey: `MEETING_ACTION_ITEM_ASSIGNED:${taskId}:${input.assigneeUserId}:${nextRowVersion}`,
          subjectTitle: task.title,
          contextTitle: relation.meetingTitle,
          taskId,
          meetingId,
        },
        transaction,
      );
    });

    const items = await meetingActionItemsRepository.listForMeeting(meetingId);
    const item = items.find((candidate) => candidate.taskId === taskId);
    if (!item) throw actionItemNotFound();
    return { item };
  },

  async validateEmailPayload(
    ownerUserId: number,
    type: "MEETING_ACTION_ITEM_ASSIGNED" | "MEETING_ACTION_ITEM_COMPLETED",
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const taskId = Number(payload.taskId);
    const meetingId = Number(payload.meetingId);
    if (
      !Number.isSafeInteger(taskId) ||
      taskId <= 0 ||
      !Number.isSafeInteger(meetingId) ||
      meetingId <= 0
    ) {
      return false;
    }

    const relation = await meetingActionItemsRepository.findContext(taskId);
    if (!relation || relation.meetingId !== meetingId) return false;

    const task = await tasksRepository.findOwnedById(
      relation.ownerUserId,
      taskId,
      getCurrentDateInAppTimeZone(),
    );
    if (!task) return false;

    if (type === "MEETING_ACTION_ITEM_ASSIGNED") {
      return (
        relation.assigneeUserId === ownerUserId &&
        task.status !== "DONE" &&
        task.status !== "CANCELLED"
      );
    }

    return relation.ownerUserId === ownerUserId && task.status === "DONE";
  },

  async assigned(
    actorUserId: number,
    query: AssignedMeetingActionItemQuery,
  ): Promise<AssignedMeetingActionItemListData> {
    const result = await meetingActionItemsRepository.listAssigned(actorUserId, query);
    return { ...result, page: query.page, pageSize: query.pageSize };
  },
};







