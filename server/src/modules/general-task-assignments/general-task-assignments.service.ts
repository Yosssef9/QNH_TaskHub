import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import { resolveTaskAccess } from "../meeting-action-items/meeting-action-items.access.js";
import { meetingActionItemsRepository } from "../meeting-action-items/meeting-action-items.repository.js";
import { taskDetailsRepository } from "../task-details/task-details.repository.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { assertTaskWritable } from "../tasks/tasks.policy.js";
import { generalTaskAssignmentsRepository as repo } from "./general-task-assignments.repository.js";
import { notifyGeneralTask, notifyRemovedAssignment, notifyTaskOwnerActivity } from "./general-task-assignments.email-events.js";
import { collaborationRepository } from "../collaboration/collaboration.repository.js";

const missing = () => new AppError({statusCode:404,code:"TASK_NOT_FOUND",message:"Task not found."});
const denied = () => new AppError({statusCode:403,code:"TASK_ASSIGNMENT_FORBIDDEN",message:"Only the creator may manage assignments."});
export const creatorSelfAssignmentError = () => new AppError({statusCode:409,
  code:"SUBTASK_CREATOR_SELF_ASSIGNMENT",message:"The task creator cannot assign a subtask to themselves while another user is responsible for the main task."});

async function validateAssignee(userId: number, transaction: DatabaseTransaction) {
  if (!(await repo.isEligibleUser(userId, transaction))) {
    throw new AppError({statusCode:400,code:"TASK_ASSIGNEE_INVALID",message:"Select an active TaskHub user."});
  }
}

export const generalTaskAssignmentsService = {
  async assignMain(actorUserId: number, taskId: number, assigneeUserId: number | null) {
    await withTransaction(async transaction => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access || access.ownerUserId !== actorUserId || access.context) throw denied();
      if (await collaborationRepository.active(taskId,transaction)) throw new AppError({statusCode:409,
        code:'COLLABORATION_USE_TEAM',message:'Manage the collaborative team instead.'});
      const task = await tasksRepository.findOwnedForUpdate(transaction, actorUserId, taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      if (task.kpiInstanceId !== null) throw denied();
      if (assigneeUserId !== null) await validateAssignee(assigneeUserId, transaction);
      const prior = await repo.findContext(taskId, transaction);
      if (prior?.assigneeUserId === assigneeUserId) return;
      if (assigneeUserId !== null && assigneeUserId !== actorUserId &&
          await repo.ownerHasExplicitSubtaskAssignment(taskId, actorUserId, transaction)) {
        throw new AppError({statusCode:409,code:"SUBTASK_OWNER_OVERRIDE_EXISTS",
          message:"Remove existing creator self-assignments from subtasks before assigning the main task to another user."});
      }
      await repo.ensureRelation(transaction, taskId, actorUserId, actorUserId, assigneeUserId, true);
      await tasksRepository.addActivity(transaction, actorUserId, taskId, "GENERAL_TASK_ASSIGNED",
        { previousAssigneeUserId: prior?.assigneeUserId ?? null, assigneeUserId }, actorUserId);
      await notifyRemovedAssignment(transaction, actorUserId,
        prior?.assigneeUserId ?? null, taskId, null);
      await notifyGeneralTask(transaction, [assigneeUserId], actorUserId, {
        type: "GENERAL_TASK_ASSIGNED", taskId, listId: task.listId,
        subjectTitle: task.title, contextTitle: "Task assigned to you",
      });
    });
    return repo.findContext(taskId);
  },

  async assignSubtask(actorUserId: number, subtaskId: number, assigneeUserId: number | null) {
    const link = await taskDetailsRepository.findSubtaskAccess(subtaskId);
    if (!link) throw missing();
    await withTransaction(async transaction => {
      const access = await resolveTaskAccess(actorUserId, link.taskId, false, transaction);
      if (!access || access.ownerUserId !== actorUserId) throw denied();
      if (await collaborationRepository.active(link.taskId,transaction)) throw new AppError({statusCode:409,
        code:'COLLABORATION_USE_TEAM',message:'Manage the collaborative subtask team instead.'});
      const task = await tasksRepository.findOwnedForUpdate(transaction, actorUserId, link.taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      if (task.kpiInstanceId !== null) throw denied();
      if (assigneeUserId !== null) {
        if (access.context) {
          if (!(await meetingActionItemsRepository.eligibleAssignee(transaction, access.context.meetingId,
              access.context.organizerUserId, assigneeUserId))) {
            throw new AppError({statusCode:400,code:"MEETING_ACTION_ITEM_ASSIGNEE_INVALID",
              message:"Choose an eligible Meeting attendee with active TaskHub access."});
          }
        } else await validateAssignee(assigneeUserId, transaction);
      }
      if (!access.context && assigneeUserId === actorUserId &&
          access.generalAssignment?.assigneeUserId != null &&
          access.generalAssignment.assigneeUserId !== actorUserId) {
        throw creatorSelfAssignmentError();
      }
      const subtask = await taskDetailsRepository.findSubtask(actorUserId, subtaskId, transaction);
      if (!subtask) throw missing();
      const former = await repo.effectiveSubtaskAssignee(actorUserId, subtaskId, transaction);
      if (!access.context) await repo.ensureRelation(transaction, link.taskId, actorUserId, actorUserId, null);
      await repo.setSubtaskAssignee(transaction, actorUserId, subtaskId, assigneeUserId);
      await tasksRepository.addActivity(transaction, actorUserId, link.taskId,
        "GENERAL_SUBTASK_ASSIGNED", {subtaskId, subtaskTitle:subtask.title, assigneeUserId}, actorUserId);
      const next = await repo.effectiveSubtaskAssignee(actorUserId, subtaskId, transaction);
      if (next !== former) {
        await notifyRemovedAssignment(transaction, actorUserId, former, link.taskId, subtaskId);
        await notifyGeneralTask(transaction, [next], actorUserId, {
          type: "GENERAL_SUBTASK_ASSIGNED", taskId: link.taskId, listId: access.context ? null : task.listId,
          subtaskId, subjectTitle: task.title, contextTitle: access.context?.meetingTitle ?? "Subtask assigned to you",
        });
      }
    });
    return { taskId: link.taskId, subtaskId };
  },

  async saveWorkNotes(actorUserId: number, subtaskId: number, workNotes: string | null) {
    const link = await taskDetailsRepository.findSubtaskAccess(subtaskId);
    if (!link) throw missing();
    await withTransaction(async transaction => {
      const access = await resolveTaskAccess(actorUserId, link.taskId, false, transaction);
      if (!access) throw missing();
      if (access.collaborationActive) throw new AppError({statusCode:409,
        code:'COLLABORATION_PRIVATE_NOTES',message:'Save notes to your individual assignment.'});
      const task = await tasksRepository.findOwnedForUpdate(transaction, access.ownerUserId, link.taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      const allowed = access.generalAssignment || access.context
        ? (await repo.effectiveSubtaskAssignee(access.ownerUserId, subtaskId, transaction)) === actorUserId
        : access.capabilities.canCompleteSubtasks;
      if (!allowed) throw new AppError({statusCode:403,code:"WORK_NOTES_FORBIDDEN",message:"Only the current subtask assignee can add Work Notes."});
      const content = workNotes?.trim();
      if (!content) throw new AppError({statusCode:400,code:"WORK_NOTE_EMPTY",
        message:"Enter a Work Note before saving."});
      const previous = await taskDetailsRepository.findSubtask(access.ownerUserId, subtaskId, transaction);
      if (!previous) throw missing();
      const noteId = await repo.addWorkNote(transaction, access.ownerUserId, link.taskId,
        subtaskId, actorUserId, content);
      await tasksRepository.addActivity(transaction, access.ownerUserId, link.taskId,
        "SUBTASK_WORK_NOTES_UPDATED", {subtaskId, subtaskTitle:previous.title, noteId}, actorUserId);
      if (actorUserId !== access.ownerUserId) {
        await notifyTaskOwnerActivity(transaction, access.ownerUserId, actorUserId, {
          type:"TASK_WORK_NOTE_ADDED",taskId:link.taskId,subtaskId,
          listId:task.listId,taskTitle:task.title,
        });
      }
    });
    return {taskId:link.taskId,subtaskId};
  },

  async saveCompletionSummary(actorUserId: number, taskId: number, completionSummary: string | null) {
    await withTransaction(async transaction => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw missing();
      if (access.collaborationActive) throw new AppError({statusCode:409,
        code:'COLLABORATION_PRIVATE_NOTES',message:'Use individual assignment notes.'});
      const task = await tasksRepository.findOwnedForUpdate(transaction, access.ownerUserId, taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      const allowed = access.generalAssignment
        ? (access.generalAssignment.assigneeUserId ?? access.ownerUserId) === actorUserId
        : (access.context ? access.context.assigneeUserId === actorUserId : access.capabilities.role === "OWNER");
      if (!allowed) throw new AppError({statusCode:403,code:"COMPLETION_SUMMARY_FORBIDDEN",
        message:"Only the current responsible assignee can add a Completion Summary."});
      const content = completionSummary?.trim();
      if (!content) throw new AppError({statusCode:400,code:"COMPLETION_SUMMARY_EMPTY",
        message:"Enter a Completion Summary before saving."});
      const entryId = await repo.addCompletionSummaryEntry(transaction, access.ownerUserId,
        taskId, actorUserId, content);
      await tasksRepository.addActivity(transaction, access.ownerUserId, taskId,
        "COMPLETION_SUMMARY_UPDATED", {entryId}, actorUserId);
    });
    return {taskId};
  },
};


