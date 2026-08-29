import { AppError } from "../../shared/errors/app-error.js";
import { holidaysRepository } from "../holidays/holidays.repository.js";
import type { KpiDeadlineDirection, PersonalKpi } from "./kpis.types.js";

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isBusinessDay(date: Date, holidays: ReadonlySet<string>): boolean {
  const day = date.getUTCDay();
  return day !== 5 && day !== 6 && !holidays.has(formatDateOnly(date));
}

export function shiftBusinessDays(
  dateOnly: string,
  amount: number,
  direction: KpiDeadlineDirection,
  holidays: ReadonlySet<string>,
): string {
  const date = parseDateOnly(dateOnly);
  const step = direction === "BEFORE" ? -1 : 1;
  let remaining = amount;

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + step);
    if (isBusinessDay(date, holidays)) remaining -= 1;
  }

  return formatDateOnly(date);
}

export async function calculateKpiTaskDueDate(
  kpi: Pick<
    PersonalKpi,
    "calculationMethod" | "businessDayOffset" | "deadlineDirection" | "taskPolicy"
  >,
  referenceDate: string,
): Promise<string> {
  if (
    kpi.taskPolicy.dueDateMode !== "AUTO" ||
    kpi.calculationMethod !== "ON_TIME_RATE" ||
    kpi.businessDayOffset === null ||
    kpi.deadlineDirection === null
  ) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_KPI_DEADLINE_CONFIGURATION",
      message: "The KPI does not have a valid automatic deadline configuration.",
    });
  }

  const activeHolidayDates = await holidaysRepository.listActiveDates();
  const holidays = new Set(activeHolidayDates.map(formatDateOnly));

  return shiftBusinessDays(referenceDate, kpi.businessDayOffset, kpi.deadlineDirection, holidays);
}
