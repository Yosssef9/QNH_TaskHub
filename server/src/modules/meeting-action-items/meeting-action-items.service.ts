import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import { meetingWorkspaceRepository } from "../meetings/meeting-workspace.repository.js";
import { requireMeetingContentAccess } from "../meetings/meeting-content-access.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { meetingActionItemsRepository } from "./meeting-action-items.repository.js";
import type {
  AssignedMeetingActionItemListData,
  AssignedMeetingActionItemQuery,
  CreateMeetingActionItemInput,
  MeetingActionItemListData,
  ReassignMeetingActionItemInput,
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
      meetingActionItemsRepository.listForMeeting(meetingId, actorUserId),
      canCreateNow(actorUserId, context),
    ]);
    return { items, canCreate };
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

      const relationRowVersion = await meetingActionItemsRepository.createRelationship(
        transaction,
        {
          taskId: created,
          meetingId,
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

      const sourceMeetingTitle =
        (await meetingActionItemsRepository.meetingTitle(meetingId, transaction)) ?? "Meeting";
      await notificationsRepository.ensureMeetingActionItemNotification(
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

    const items = await meetingActionItemsRepository.listForMeeting(meetingId, actorUserId);
    const item = items.find((candidate) => candidate.taskId === taskId);
    if (!item) throw actionItemNotFound();
    return { item };
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
      const relation = await meetingActionItemsRepository.findContext(taskId, transaction);
      if (!relation || relation.meetingId !== meetingId || relation.ownerUserId !== actorUserId) {
        throw actionItemNotFound();
      }

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

    const items = await meetingActionItemsRepository.listForMeeting(meetingId, actorUserId);
    const item = items.find((candidate) => candidate.taskId === taskId);
    if (!item) throw actionItemNotFound();
    return { item };
  },

  async assigned(
    actorUserId: number,
    query: AssignedMeetingActionItemQuery,
  ): Promise<AssignedMeetingActionItemListData> {
    const result = await meetingActionItemsRepository.listAssigned(actorUserId, query);
    return { ...result, page: query.page, pageSize: query.pageSize };
  },
};

