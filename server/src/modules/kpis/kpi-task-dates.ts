import { AppError } from "../../shared/errors/app-error.js";
import { calculateKpiTaskDueDate } from "./kpi-deadline.js";
import type { PersonalKpi } from "./kpis.types.js";

export interface KpiTaskDateInput {
  startDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  referenceDate?: string | null | undefined;
}

export interface KpiTaskDateState {
  startDate: string | null;
  dueDate: string | null;
  referenceDate: string | null;
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

export async function resolveKpiTaskDates(
  kpi: PersonalKpi,
  input: KpiTaskDateInput,
  current?: KpiTaskDateState,
): Promise<KpiTaskDateState> {
  const policy = kpi.taskPolicy;

  if (!policy.allowsTasks) {
    throw new AppError({
      statusCode: 409,
      code: "KPI_TASKS_NOT_SUPPORTED",
      message: "This KPI does not accept KPI tasks.",
    });
  }

  const startDate = input.startDate !== undefined ? input.startDate : (current?.startDate ?? null);
  const requestedDueDate = input.dueDate !== undefined ? input.dueDate : (current?.dueDate ?? null);
  const referenceDate =
    input.referenceDate !== undefined ? input.referenceDate : (current?.referenceDate ?? null);

  if (policy.dueDateMode === "AUTO") {
    if (!referenceDate) {
      throw new AppError({
        statusCode: 400,
        code: "KPI_REFERENCE_DATE_REQUIRED",
        message: "This KPI requires a reference date.",
      });
    }

    if (input.dueDate !== undefined && input.dueDate !== null) {
      throw new AppError({
        statusCode: 400,
        code: "KPI_TASK_DUE_DATE_MANAGED",
        message: "The due date for this KPI is calculated automatically.",
      });
    }

    const dueDate =
      current?.referenceDate === referenceDate && current.dueDate
        ? current.dueDate
        : await calculateKpiTaskDueDate(kpi, referenceDate);

    assertDateRange(startDate, dueDate);
    return { startDate, dueDate, referenceDate };
  }

  if (referenceDate !== null) {
    throw new AppError({
      statusCode: 400,
      code: "KPI_REFERENCE_DATE_FORBIDDEN",
      message: "This KPI does not use a reference date.",
    });
  }

  if (policy.dueDateMode === "REQUIRED" && !requestedDueDate) {
    throw new AppError({
      statusCode: 400,
      code: "KPI_TASK_DUE_DATE_REQUIRED",
      message: "This KPI requires a task due date.",
    });
  }

  if (policy.dueDateMode === "NONE" && requestedDueDate !== null) {
    throw new AppError({
      statusCode: 400,
      code: "KPI_TASK_DUE_DATE_FORBIDDEN",
      message: "This KPI does not use task due dates.",
    });
  }

  assertDateRange(startDate, requestedDueDate);

  return {
    startDate,
    dueDate: requestedDueDate,
    referenceDate: null,
  };
}
