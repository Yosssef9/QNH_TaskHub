import { getCurrentDateInAppTimeZone } from "../../shared/utils/date.utils.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Normal list tasks cannot be backdated. Existing historical dates may stay
 * unchanged while users edit other task details. KPI/Meeting workflows do not
 * call this guard; they retain their own date policies.
 */
export function assertNormalTaskStartDateAllowed(
  startDate: string | null | undefined,
  previousStartDate: string | null = null,
  today: string = getCurrentDateInAppTimeZone(),
): void {
  if (startDate && startDate !== previousStartDate && startDate < today) {
    throw new AppError({
      statusCode: 400,
      code: "TASK_START_DATE_IN_PAST",
      message: "Start date cannot be earlier than today.",
    });
  }
}
