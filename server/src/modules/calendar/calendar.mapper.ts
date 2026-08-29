import { AppError } from "../../shared/errors/app-error.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "../tasks/tasks.constants.js";
import { CALENDAR_DATE_SOURCES } from "./calendar.types.js";
import type { CalendarTask, CalendarTaskRecord } from "./calendar.types.js";

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function optionalId(value: number | string | null, label: string): number | null {
  return value === null ? null : parsePositiveIntegerId(value, label);
}

export function mapCalendarTask(record: CalendarTaskRecord): CalendarTask {
  if (!TASK_STATUSES.some((status) => status === record.status)) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_CALENDAR_TASK_STATUS",
      message: "Calendar task has an invalid status.",
    });
  }

  if (!TASK_PRIORITIES.some((priority) => priority === record.priority)) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_CALENDAR_TASK_PRIORITY",
      message: "Calendar task has an invalid priority.",
    });
  }

  if (!CALENDAR_DATE_SOURCES.some((source) => source === record.calendarDateSource)) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_CALENDAR_DATE_SOURCE",
      message: "Calendar task has an invalid date source.",
    });
  }

  return {
    id: parsePositiveIntegerId(record.id, "calendar task id"),
    title: record.title,
    calendarDate: record.calendarDate.toISOString().slice(0, 10),
    calendarDateSource: record.calendarDateSource as CalendarTask["calendarDateSource"],
    status: record.status as CalendarTask["status"],
    priority: record.priority as CalendarTask["priority"],
    startDate: dateOnly(record.startDate),
    dueDate: dateOnly(record.dueDate),
    isOverdue: record.isOverdue,
    listId: optionalId(record.listId, "calendar list id"),
    listName: record.listName,
    cycleId: optionalId(record.cycleId, "calendar cycle id"),
    cycleTitle: record.cycleTitle,
    kpiInstanceId: optionalId(record.kpiInstanceId, "calendar KPI instance id"),
    kpiTemplateId: optionalId(record.kpiTemplateId, "calendar KPI template id"),
    kpiName: record.kpiName,
    isReadOnly: record.cycleClosedAtUtc !== null,
  };
}
