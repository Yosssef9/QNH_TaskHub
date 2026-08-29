import { AppError } from "../../shared/errors/app-error.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "./tasks.constants.js";
import type { PersonalTask, TaskRecord } from "./tasks.types.js";

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dateTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function mapTask(record: TaskRecord): PersonalTask {
  if (!TASK_STATUSES.some((status) => status === record.status)) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_TASK_STATUS",
      message: "Invalid task status.",
    });
  }
  if (!TASK_PRIORITIES.some((priority) => priority === record.priority)) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_TASK_PRIORITY",
      message: "Invalid task priority.",
    });
  }

  return {
    id: parsePositiveIntegerId(record.id, "task id"),
    listId:
      record.listId === null ? null : parsePositiveIntegerId(record.listId, "task list id"),
    kpiInstanceId: record.kpiInstanceId === null ? null : parsePositiveIntegerId(record.kpiInstanceId, "task KPI instance id"),
    kpiId: record.kpiId === null ? null : parsePositiveIntegerId(record.kpiId, "task KPI id"),
    cycleId: record.cycleId === null ? null : parsePositiveIntegerId(record.cycleId, "task Work Cycle id"),
    cycleTitle: record.cycleTitle,
    kpiName: record.kpiName,
    kpiIconKey: record.kpiIconKey,
    kpiColor: record.kpiColor,
    isReadOnly: record.cycleClosedAtUtc !== null,
    title: record.title,
    description: record.description,
    status: record.status as PersonalTask["status"],
    priority: record.priority as PersonalTask["priority"],
    startDate: dateOnly(record.startDate),
    dueDate: dateOnly(record.dueDate),
    referenceDate: dateOnly(record.referenceDate),
    displayOrder: record.displayOrder,
    createdAtUtc: record.createdAtUtc.toISOString(),
    updatedAtUtc: dateTime(record.updatedAtUtc),
    completedAtUtc: dateTime(record.completedAtUtc),
    cancelledAtUtc: dateTime(record.cancelledAtUtc),
    cancellationReason: record.cancellationReason,
    isOverdue: record.isOverdue,
    subtaskTotal: Number(record.subtaskTotal),
    subtaskCompleted: Number(record.subtaskCompleted),
  };
}
