import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import { resolveTaskAccess } from "../meeting-action-items/meeting-action-items.access.js";
import { taskDetailsRepository } from "../task-details/task-details.repository.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { assertTaskWritable } from "../tasks/tasks.policy.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { generalTaskAssignmentsRepository as repo } from "./general-task-assignments.repository.js";

const missing = () => new AppError({statusCode:404,code:"TASK_NOT_FOUND",message:"Task not found."});
const denied = () => new AppError({statusCode:403,code:"TASK_ASSIGNMENT_FORBIDDEN",message:"Only the creator may manage assignments."});

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
      const task = await tasksRepository.findOwnedForUpdate(transaction, actorUserId, taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      if (task.kpiInstanceId !== null) throw denied();
      if (assigneeUserId !== null) await validateAssignee(assigneeUserId, transaction);
      const prior = await repo.findContext(taskId, transaction);
      if (prior?.assigneeUserId === assigneeUserId) return;
      await repo.ensureRelation(transaction, taskId, actorUserId, actorUserId, assigneeUserId, true);
      await tasksRepository.addActivity(transaction, actorUserId, taskId, "GENERAL_TASK_ASSIGNED",
        { previousAssigneeUserId: prior?.assigneeUserId ?? null, assigneeUserId }, actorUserId);
      if (assigneeUserId !== null && assigneeUserId !== actorUserId) {
        await notificationsRepository.ensureGeneralTaskNotification(assigneeUserId, {
          type:"GENERAL_TASK_ASSIGNED", taskId, listId:task.listId,
          subjectTitle: task.title, contextTitle:"Task assigned to you",
          dedupeKey:`GENERAL_TASK_ASSIGNED:${taskId}:${assigneeUserId}:${Date.now()}`,
        }, transaction);
      }
    });
    return repo.findContext(taskId);
  },

  async assignSubtask(actorUserId: number, subtaskId: number, assigneeUserId: number | null) {
    const link = await taskDetailsRepository.findSubtaskAccess(subtaskId);
    if (!link) throw missing();
    await withTransaction(async transaction => {
      const access = await resolveTaskAccess(actorUserId, link.taskId, false, transaction);
      if (!access || access.ownerUserId !== actorUserId || access.context) throw denied();
      const task = await tasksRepository.findOwnedForUpdate(transaction, actorUserId, link.taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      if (task.kpiInstanceId !== null) throw denied();
      if (assigneeUserId !== null) await validateAssignee(assigneeUserId, transaction);
      const subtask = await taskDetailsRepository.findSubtask(actorUserId, subtaskId, transaction);
      if (!subtask) throw missing();
      const former = await repo.effectiveSubtaskAssignee(actorUserId, subtaskId, transaction);
      await repo.ensureRelation(transaction, link.taskId, actorUserId, actorUserId, null);
      await repo.setSubtaskAssignee(transaction, actorUserId, subtaskId, assigneeUserId);
      await tasksRepository.addActivity(transaction, actorUserId, link.taskId,
        "GENERAL_SUBTASK_ASSIGNED", {subtaskId, assigneeUserId}, actorUserId);
      const next = await repo.effectiveSubtaskAssignee(actorUserId, subtaskId, transaction);
      if (next !== null && next !== actorUserId && next !== former) {
        await notificationsRepository.ensureGeneralTaskNotification(next, {
          type:"GENERAL_SUBTASK_ASSIGNED",taskId:link.taskId,listId:task.listId,
          subjectTitle:task.title,contextTitle:"Subtask assigned to you",
          dedupeKey:`GENERAL_SUBTASK_ASSIGNED:${subtaskId}:${next}:${Date.now()}`,
        },transaction);
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
      const task = await tasksRepository.findOwnedForUpdate(transaction, access.ownerUserId, link.taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      const allowed = access.generalAssignment
        ? (await repo.effectiveSubtaskAssignee(access.ownerUserId, subtaskId, transaction)) === actorUserId
        : access.capabilities.canCompleteSubtasks;
      if (!allowed) throw new AppError({statusCode:403,code:"WORK_NOTES_FORBIDDEN",message:"You cannot edit this subtask's Work Notes."});
      if (!(await taskDetailsRepository.findSubtask(access.ownerUserId, subtaskId, transaction))) throw missing();
      await repo.saveWorkNotes(transaction, access.ownerUserId, subtaskId, workNotes);
      await tasksRepository.addActivity(transaction, access.ownerUserId, link.taskId,
        "SUBTASK_WORK_NOTES_UPDATED", {subtaskId}, actorUserId);
    });
    return {taskId:link.taskId,subtaskId};
  },

  async saveCompletionSummary(actorUserId: number, taskId: number, completionSummary: string | null) {
    await withTransaction(async transaction => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw missing();
      const task = await tasksRepository.findOwnedForUpdate(transaction, access.ownerUserId, taskId);
      if (!task) throw missing();
      assertTaskWritable(task);
      const allowed = access.generalAssignment
        ? (access.generalAssignment.assigneeUserId ?? access.ownerUserId) === actorUserId
        : (access.context ? access.capabilities.role === "ASSIGNEE" : access.capabilities.role === "OWNER");
      if (!allowed) throw new AppError({statusCode:403,code:"COMPLETION_SUMMARY_FORBIDDEN",message:"You cannot edit this Completion Summary."});
      await repo.saveCompletionSummary(transaction, access.ownerUserId, taskId, completionSummary);
      await tasksRepository.addActivity(transaction, access.ownerUserId, taskId,
        "COMPLETION_SUMMARY_UPDATED", undefined, actorUserId);
    });
    return {taskId};
  },
};
