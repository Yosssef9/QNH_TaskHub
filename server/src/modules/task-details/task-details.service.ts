import path from "node:path";

import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
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
  async get(ownerUserId: number, taskId: number): Promise<TaskDetails> {
    const task = await assertTask(ownerUserId, taskId);
    const [subtasks, attachments, activity] = await Promise.all([
      taskDetailsRepository.listSubtasks(ownerUserId, taskId),
      taskDetailsRepository.listAttachments(ownerUserId, taskId),
      taskDetailsRepository.listActivity(ownerUserId, taskId),
    ]);
    const completed = subtasks.filter((item) => item.isCompleted).length;
    return {
      task: mapTask(task),
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
    ownerUserId: number,
    taskId: number,
    input: { title: string; dueDate?: string | null | undefined },
  ) {
    const id = await withTransaction(async (transaction) => {
      const task = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, taskId);
      if (!task) throw notFound();
      assertTaskWritable(task);

      const dueDate = input.dueDate ?? null;
      await assertSubtaskDueDateAllowed(ownerUserId, task, dueDate);

      const created = await taskDetailsRepository.createSubtask(
        transaction,
        ownerUserId,
        taskId,
        input.title,
        dueDate,
      );
      if (!created)
        throw new AppError({
          statusCode: 500,
          code: "SUBTASK_CREATE_FAILED",
          message: "Subtask could not be created.",
        });
      await tasksRepository.addActivity(transaction, ownerUserId, taskId, "SUBTASK_CREATED", {
        subtaskId: created,
        title: input.title,
      });
      return created;
    });
    const subtask = await taskDetailsRepository.findSubtask(ownerUserId, id);
    if (!subtask) throw subtaskNotFound();
    return mapSubtask(subtask);
  },

  async updateSubtask(
    ownerUserId: number,
    subtaskId: number,
    input: { title?: string | undefined; dueDate?: string | null | undefined },
  ) {
    const taskId = await withTransaction(async (transaction) => {
      const current = await taskDetailsRepository.findSubtask(ownerUserId, subtaskId, transaction);
      if (!current) throw subtaskNotFound();

      const task = await tasksRepository.findOwnedForUpdate(
        transaction,
        ownerUserId,
        Number(current.taskId),
      );
      if (!task) throw notFound();
      assertTaskWritable(task);

      const dueDate =
        input.dueDate !== undefined
          ? input.dueDate
          : (current.dueDate?.toISOString().slice(0, 10) ?? null);

      await assertSubtaskDueDateAllowed(ownerUserId, task, dueDate);

      await taskDetailsRepository.updateSubtask(
        transaction,
        ownerUserId,
        subtaskId,
        input.title ?? current.title,
        dueDate,
      );
      await tasksRepository.addActivity(
        transaction,
        ownerUserId,
        Number(current.taskId),
        "SUBTASK_UPDATED",
        { subtaskId },
      );
      return Number(current.taskId);
    });
    const subtask = await taskDetailsRepository.findSubtask(ownerUserId, subtaskId);
    if (!subtask) throw subtaskNotFound();
    return { subtask: mapSubtask(subtask), taskId };
  },

  async completeSubtask(ownerUserId: number, subtaskId: number, isCompleted: boolean) {
    return withTransaction(async (transaction) => {
      const current = await taskDetailsRepository.findSubtask(ownerUserId, subtaskId, transaction);
      if (!current) throw subtaskNotFound();
      const task = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, Number(current.taskId));
      if (!task) throw notFound();
      assertTaskWritable(task);
      if (current.isCompleted !== isCompleted) {
        await taskDetailsRepository.completeSubtask(
          transaction,
          ownerUserId,
          subtaskId,
          isCompleted,
        );
        await tasksRepository.addActivity(
          transaction,
          ownerUserId,
          Number(current.taskId),
          isCompleted ? "SUBTASK_COMPLETED" : "SUBTASK_REOPENED",
          { subtaskId },
        );
      }
      return Number(current.taskId);
    });
  },

  async deleteSubtask(ownerUserId: number, subtaskId: number) {
    return withTransaction(async (transaction) => {
      const current = await taskDetailsRepository.findSubtask(ownerUserId, subtaskId, transaction);
      if (!current) throw subtaskNotFound();
      const task = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, Number(current.taskId));
      if (!task) throw notFound();
      assertTaskWritable(task);
      await taskDetailsRepository.deleteSubtask(transaction, ownerUserId, subtaskId);
      await tasksRepository.addActivity(
        transaction,
        ownerUserId,
        Number(current.taskId),
        "SUBTASK_DELETED",
        { subtaskId, title: current.title },
      );
      return Number(current.taskId);
    });
  },

  async reorder(ownerUserId: number, taskId: number, ids: number[]) {
    await withTransaction(async (transaction) => {
      const task = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, taskId);
      if (!task) throw notFound();
      assertTaskWritable(task);
      const current = await taskDetailsRepository.listSubtasks(ownerUserId, taskId, transaction);
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
      await taskDetailsRepository.reorderSubtasks(transaction, ownerUserId, taskId, ids);
      await tasksRepository.addActivity(transaction, ownerUserId, taskId, "SUBTASKS_REORDERED");
    });
  },

  async upload(
    ownerUserId: number,
    parent: { taskId?: number; subtaskId?: number },
    file: Express.Multer.File,
  ) {
    let taskId = parent.taskId ?? null;
    if (parent.subtaskId) {
      const subtask = await taskDetailsRepository.findSubtask(ownerUserId, parent.subtaskId);
      if (!subtask) throw subtaskNotFound();
      taskId = Number(subtask.taskId);
    } else if (taskId) {
      const task = await assertTask(ownerUserId, taskId);
      assertTaskWritable(task);
    }
    if (!taskId) throw notFound();
    if (parent.subtaskId) {
      const task = await assertTask(ownerUserId, taskId);
      assertTaskWritable(task);
    }
    const originalFileName = Array.from(path.basename(file.originalname))
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join("")
      .trim()
      .slice(0, 260);
    if (!originalFileName) {
      throw new AppError({
        statusCode: 400,
        code: "ATTACHMENT_NAME_INVALID",
        message: "Attachment file name is invalid.",
      });
    }
    const extension = path.extname(originalFileName).toLowerCase();
    const key = await storeAttachment(file.buffer, extension);
    try {
      const record = await withTransaction(async (transaction) => {
        const created = await taskDetailsRepository.createAttachment(transaction, {
          ownerUserId,
          taskId: parent.taskId ?? null,
          subtaskId: parent.subtaskId ?? null,
          name: originalFileName,
          key,
          mime: file.mimetype || "application/octet-stream",
          extension,
          size: file.size,
        });
        if (!created)
          throw new AppError({
            statusCode: 500,
            code: "ATTACHMENT_CREATE_FAILED",
            message: "Attachment could not be saved.",
          });
        await tasksRepository.addActivity(transaction, ownerUserId, taskId!, "ATTACHMENT_ADDED", {
          attachmentId: created.id,
          fileName: originalFileName,
          subtaskId: parent.subtaskId ?? null,
        });
        return created;
      });
      return mapAttachment(record);
    } catch (error) {
      await removeStoredAttachment(key);
      throw error;
    }
  },

  async download(ownerUserId: number, id: string) {
    const attachment = await taskDetailsRepository.findAttachment(ownerUserId, id);
    if (!attachment) throw attachmentNotFound();
    return { attachment, buffer: await readAttachment(attachment.storageKey) };
  },

  async deleteAttachment(ownerUserId: number, id: string) {
    const record = await withTransaction(async (transaction) => {
      const attachment = await taskDetailsRepository.findAttachment(ownerUserId, id, transaction);
      if (!attachment) throw attachmentNotFound();
      const taskId =
        attachment.taskId ??
        (attachment.subtaskId
          ? (
              await taskDetailsRepository.findSubtask(
                ownerUserId,
                Number(attachment.subtaskId),
                transaction,
              )
            )?.taskId
          : null);
      if (taskId) {
        const task = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, Number(taskId));
        if (!task) throw notFound();
        assertTaskWritable(task);
      }
      await taskDetailsRepository.deleteAttachment(transaction, ownerUserId, id);
      if (taskId)
        await tasksRepository.addActivity(transaction, ownerUserId, Number(taskId), "ATTACHMENT_REMOVED", {
          attachmentId: id,
          fileName: attachment.originalFileName,
        });
      return attachment;
    });
    await removeStoredAttachment(record.storageKey);
  },
};
