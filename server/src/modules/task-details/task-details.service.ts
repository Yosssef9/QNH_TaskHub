import path from "node:path";

import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import { resolveTaskAccess } from "../meeting-action-items/meeting-action-items.access.js";
import { mapTask } from "../tasks/tasks.mapper.js";
import { assertTaskWritable } from "../tasks/tasks.policy.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import { readAttachment, removeStoredAttachment, storeAttachment } from "./attachment-storage.js";
import { mapActivity, mapAttachment, mapSubtask } from "./task-details.mapper.js";
import { taskDetailsRepository } from "./task-details.repository.js";
import type { TaskDetails } from "./task-details.types.js";

const notFound = () =>
  new AppError({ statusCode: 404, code: "TASK_NOT_FOUND", message: "Task not found." });
const subtaskNotFound = () =>
  new AppError({ statusCode: 404, code: "SUBTASK_NOT_FOUND", message: "Subtask not found." });
const attachmentNotFound = () =>
  new AppError({ statusCode: 404, code: "ATTACHMENT_NOT_FOUND", message: "Attachment not found." });


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
    return {
      task: mapTask(task),
      actionItem: resolved.context,
      capabilities: resolved.capabilities,
      subtasks: subtasks.map(mapSubtask),
      attachments: attachments.map(mapAttachment),
      activity: activity.map(mapActivity),
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
    input: { title: string; dueDate?: string | null | undefined },
  ) {
    let ownerUserId = actorUserId;
    const id = await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw notFound();
      if (!access.capabilities.canManageSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "The Action Item assignee cannot create or redefine subtasks.",
        });
      }
      ownerUserId = access.ownerUserId;
      const task = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, taskId);
      if (!task) throw notFound();
      assertTaskWritable(task);

      const dueDate = input.dueDate ?? null;
      await assertSubtaskDueDateAllowed(ownerUserId, task, dueDate);
      const created = await taskDetailsRepository.createSubtask(
        transaction, ownerUserId, taskId, input.title, dueDate,
      );
      if (!created) {
        throw new AppError({
          statusCode: 500,
          code: "SUBTASK_CREATE_FAILED",
          message: "Subtask could not be created.",
        });
      }
      await tasksRepository.addActivity(
        transaction, ownerUserId, taskId, "SUBTASK_CREATED",
        { subtaskId: created, title: input.title }, actorUserId,
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
    input: { title?: string | undefined; dueDate?: string | null | undefined },
  ) {
    const link = await taskDetailsRepository.findSubtaskAccess(subtaskId);
    if (!link) throw subtaskNotFound();
    let ownerUserId = actorUserId;
    const taskId = await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, link.taskId, false, transaction);
      if (!access) throw subtaskNotFound();
      if (!access.capabilities.canManageSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "The Action Item assignee cannot create or redefine subtasks.",
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
      await taskDetailsRepository.updateSubtask(
        transaction, ownerUserId, subtaskId, input.title ?? current.title, dueDate,
      );
      await tasksRepository.addActivity(
        transaction, ownerUserId, Number(current.taskId), "SUBTASK_UPDATED",
        { subtaskId }, actorUserId,
      );
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
      if (!resolved || !resolved.capabilities.canCompleteSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_COMPLETION_FORBIDDEN",
          message: "You cannot change completion for this subtask.",
        });
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
          { subtaskId },
          actorUserId,
        );
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
      if (!access.capabilities.canManageSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "The Action Item assignee cannot create or redefine subtasks.",
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
      await taskDetailsRepository.deleteSubtask(transaction, access.ownerUserId, subtaskId);
      await tasksRepository.addActivity(
        transaction, access.ownerUserId, Number(current.taskId), "SUBTASK_DELETED",
        { subtaskId, title: current.title }, actorUserId,
      );
      return Number(current.taskId);
    });
  },

  async reorder(actorUserId: number, taskId: number, ids: number[]) {
    await withTransaction(async (transaction) => {
      const access = await resolveTaskAccess(actorUserId, taskId, false, transaction);
      if (!access) throw notFound();
      if (!access.capabilities.canManageSubtasks) {
        throw new AppError({
          statusCode: 403,
          code: "SUBTASK_MANAGEMENT_FORBIDDEN",
          message: "The Action Item assignee cannot reorder subtasks.",
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
    if (!preflight || !preflight.capabilities.canUploadAttachments) {
      throw new AppError({
        statusCode: 403,
        code: "ATTACHMENT_UPLOAD_FORBIDDEN",
        message: "You cannot upload files to this Task.",
      });
    }
    const task = await assertTask(preflight.ownerUserId, taskId);
    assertTaskWritable(task);
    const originalFileName = Array.from(path.basename(file.originalname))
      .filter((character) => { const code = character.charCodeAt(0); return code >= 32 && code !== 127; })
      .join("").trim().slice(0, 260);
    if (!originalFileName) throw new AppError({ statusCode: 400, code: "ATTACHMENT_NAME_INVALID", message: "Attachment file name is invalid." });
    const extension = path.extname(originalFileName).toLowerCase();
    const key = await storeAttachment(file.buffer, extension);
    try {
      const record = await withTransaction(async (transaction) => {
        const resolved = await resolveTaskAccess(actorUserId, taskId!, false, transaction);
        if (!resolved || !resolved.capabilities.canUploadAttachments) {
          throw new AppError({
            statusCode: 403,
            code: "ATTACHMENT_UPLOAD_FORBIDDEN",
            message: "You cannot upload files to this Task.",
          });
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
    const attachment = await taskDetailsRepository.findAttachment(resolved.ownerUserId, id);
    if (!attachment) throw attachmentNotFound();
    return { attachment, buffer: await readAttachment(attachment.storageKey) };
  },

  async deleteAttachment(actorUserId: number, id: string) {
    const accessRow = await taskDetailsRepository.findAttachmentAccess(id);
    if (!accessRow) throw attachmentNotFound();
    const resolved = await resolveTaskAccess(actorUserId, accessRow.taskId);
    if (!resolved) throw attachmentNotFound();
    const mayDelete = resolved.capabilities.canDeleteAnyAttachment || accessRow.uploadedByUserId === actorUserId;
    if (!mayDelete) throw new AppError({ statusCode: 403, code: "ATTACHMENT_DELETE_FORBIDDEN", message: "You may delete only files you uploaded." });
    const record = await withTransaction(async (transaction) => {
      const currentAccess = await resolveTaskAccess(
        actorUserId,
        accessRow.taskId,
        false,
        transaction,
      );
      if (!currentAccess) throw attachmentNotFound();
      const canDelete =
        currentAccess.capabilities.canDeleteAnyAttachment ||
        accessRow.uploadedByUserId === actorUserId;
      if (!canDelete) {
        throw new AppError({
          statusCode: 403,
          code: "ATTACHMENT_DELETE_FORBIDDEN",
          message: "You may delete only files you uploaded.",
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
        { attachmentId: id, fileName: attachment.originalFileName },
        actorUserId,
      );
      return attachment;
    });
    await removeStoredAttachment(record.storageKey);
  },
};

