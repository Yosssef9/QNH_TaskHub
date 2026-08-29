import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { resolveKpiTaskDates } from "../kpis/kpi-task-dates.js";
import { workCyclesService } from "../work-cycles/work-cycles.service.js";
import { mapTask } from "./tasks.mapper.js";
import { assertTaskStatusTransition, assertTaskWritable } from "./tasks.policy.js";
import { tasksRepository } from "./tasks.repository.js";
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
  return new AppError({ statusCode: 404, code: "TASK_NOT_FOUND", message: "Task not found." });
}

function listNotFound(): AppError {
  return new AppError({ statusCode: 404, code: "LIST_NOT_FOUND", message: "List not found." });
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
  async list(ownerUserId: number, listId: number, query: TaskListQuery): Promise<TaskListResult> {
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

  async get(ownerUserId: number, taskId: number): Promise<PersonalTask> {
    return loadTask(ownerUserId, taskId);
  },

  async create(ownerUserId: number, listId: number, input: CreateTaskInput): Promise<PersonalTask> {
    const taskId = await withTransaction(async (transaction) => {
      if (!(await tasksRepository.ownedListExists(ownerUserId, listId, transaction))) {
        throw listNotFound();
      }

      const createdId = await tasksRepository.create(transaction, ownerUserId, listId, input);

      if (!createdId) {
        throw new AppError({
          statusCode: 500,
          code: "TASK_CREATE_FAILED",
          message: "Task could not be created.",
        });
      }

      await tasksRepository.addActivity(transaction, ownerUserId, createdId, "CREATED", {
        listId,
        title: input.title,
      });

      return createdId;
    });

    return loadTask(ownerUserId, taskId);
  },

  async update(ownerUserId: number, taskId: number, input: UpdateTaskInput): Promise<PersonalTask> {
    await withTransaction(async (transaction) => {
      const current = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, taskId);
      if (!current) throw notFound();
      assertTaskWritable(current);

      if (current.kpiInstanceId !== null && input.listId !== undefined) {
        throw new AppError({
          statusCode: 409,
          code: "KPI_TASK_CONTAINER_IMMUTABLE",
          message: "KPI tasks cannot be moved into a normal list.",
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
        assertDateRange(startDate, dueDate);
      }

      const next = {
        listId: destinationListId,
        title: input.title ?? current.title,
        description: input.description !== undefined ? input.description : current.description,
        priority: input.priority ?? mapTask(current).priority,
        startDate,
        dueDate,
        referenceDate,
      };

      await tasksRepository.update(transaction, ownerUserId, taskId, next);
      await tasksRepository.addActivity(transaction, ownerUserId, taskId, "UPDATED", {
        fromListId: current.listId,
        toListId: destinationListId,
      });
    });

    return loadTask(ownerUserId, taskId);
  },

  async changeStatus(
    ownerUserId: number,
    taskId: number,
    input: ChangeTaskStatusInput,
  ): Promise<PersonalTask> {
    await withTransaction(async (transaction) => {
      const current = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, taskId);
      if (!current) throw notFound();
      assertTaskWritable(current);

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

      await tasksRepository.addActivity(transaction, ownerUserId, taskId, "STATUS_CHANGED", {
        from: currentStatus,
        to: input.status,
      });
    });

    return loadTask(ownerUserId, taskId);
  },

  async remove(ownerUserId: number, taskId: number): Promise<void> {
    await withTransaction(async (transaction) => {
      const current = await tasksRepository.findOwnedForUpdate(transaction, ownerUserId, taskId);
      if (!current) throw notFound();
      assertTaskWritable(current);

      await tasksRepository.setDeleted(transaction, ownerUserId, taskId, true);
      await tasksRepository.addActivity(transaction, ownerUserId, taskId, "DELETED");
    });
  },

  async restore(ownerUserId: number, taskId: number): Promise<PersonalTask> {
    await withTransaction(async (transaction) => {
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
        !(await tasksRepository.ownedKpiInstanceIsOpen(ownerUserId, current.kpiInstanceId, transaction))
      ) {
        throw new AppError({
          statusCode: 409,
          code: "TASK_KPI_INSTANCE_UNAVAILABLE",
          message: "This task cannot be restored because its Work Cycle is unavailable.",
        });
      }

      await tasksRepository.setDeleted(transaction, ownerUserId, taskId, false);
      await tasksRepository.addActivity(transaction, ownerUserId, taskId, "RESTORED");
    });

    return loadTask(ownerUserId, taskId);
  },
};
