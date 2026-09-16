import { AppError } from "../../shared/errors/app-error.js";
import {
  MEETING_SERIES_TIME_ZONE,
  type MeetingSeriesWeekday,
} from "./meeting-series.types.js";

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

interface LocalTimeParts {
  hour: number;
  minute: number;
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const zonedDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MEETING_SERIES_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const weekdayByUtcDay: readonly MeetingSeriesWeekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function invalidLocalDate(value: string): AppError {
  return new AppError({
    statusCode: 400,
    code: "INVALID_MEETING_SERIES_LOCAL_DATE",
    message: `Invalid Meeting Series local date: ${value}.`,
  });
}

function invalidLocalTime(value: string): AppError {
  return new AppError({
    statusCode: 400,
    code: "INVALID_MEETING_SERIES_LOCAL_TIME",
    message: `Invalid Meeting Series local time: ${value}.`,
  });
}

export function parseLocalDate(value: string): LocalDateParts {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw invalidLocalDate(value);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw invalidLocalDate(value);
  }

  return { year, month, day };
}

export function parseLocalTime(value: string): LocalTimeParts {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) throw invalidLocalTime(value);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw invalidLocalTime(value);

  return { hour, minute };
}

export function formatLocalDate(parts: LocalDateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function toDateOnlyUtc(value: string): Date {
  const parts = parseLocalDate(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function compareLocalDates(left: string, right: string): number {
  return toDateOnlyUtc(left).getTime() - toDateOnlyUtc(right).getTime();
}

export function addLocalDays(value: string, days: number): string {
  const date = toDateOnlyUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatLocalDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addLocalMonthsClamped(value: string, months: number): string {
  const parts = parseLocalDate(value);
  const targetMonthIndex = parts.month - 1 + months;
  const targetYear = parts.year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, normalizedMonthIndex + 1, 0),
  ).getUTCDate();

  return formatLocalDate({
    year: targetYear,
    month: normalizedMonthIndex + 1,
    day: Math.min(parts.day, daysInTargetMonth),
  });
}

export function weekdayForLocalDate(value: string): MeetingSeriesWeekday {
  const weekday = weekdayByUtcDay[toDateOnlyUtc(value).getUTCDay()];
  if (!weekday) throw invalidLocalDate(value);
  return weekday;
}

export function sundayOnOrBefore(value: string): string {
  const date = toDateOnlyUtc(value);
  return addLocalDays(value, -date.getUTCDay());
}

export function localDateDifferenceInDays(from: string, to: string): number {
  return Math.floor((toDateOnlyUtc(to).getTime() - toDateOnlyUtc(from).getTime()) / 86_400_000);
}

function zonedParts(value: Date): Required<LocalDateParts & LocalTimeParts> & { second: number } {
  const parts = zonedDateTimeFormatter.formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day")),
    hour: Number(byType.get("hour")),
    minute: Number(byType.get("minute")),
    second: Number(byType.get("second")),
  };
}

export function riyadhLocalDateTimeToUtc(localDate: string, localTime: string): Date {
  const date = parseLocalDate(localDate);
  const time = parseLocalTime(localTime);
  const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  let candidateEpoch = desiredAsUtc;

  // Resolve the IANA-zone offset without adding a date library. Iteration handles
  // an offset transition if the configured zone ever gains one in the future.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = new Date(candidateEpoch);
    const observed = zonedParts(current);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      0,
    );
    const offsetMs = observedAsUtc - candidateEpoch;
    const nextEpoch = desiredAsUtc - offsetMs;
    if (nextEpoch === candidateEpoch) break;
    candidateEpoch = nextEpoch;
  }

  const result = new Date(candidateEpoch);
  const roundTrip = zonedParts(result);
  if (
    roundTrip.year !== date.year ||
    roundTrip.month !== date.month ||
    roundTrip.day !== date.day ||
    roundTrip.hour !== time.hour ||
    roundTrip.minute !== time.minute
  ) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_SERIES_LOCAL_DATETIME",
      message: "The selected local Meeting time cannot be represented in the TaskHub timezone.",
    });
  }

  return result;
}

export function meetingSeriesWindowToUtc(
  date: string,
  startTime: string,
  endTime: string,
): { startAtUtc: Date; endAtUtc: Date } {
  const start = parseLocalTime(startTime);
  const end = parseLocalTime(endTime);
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  if (startMinutes === endMinutes) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_SCHEDULE_WINDOW",
      message: "Meeting end time must be after its start time.",
    });
  }

  const endDate = endMinutes < startMinutes ? addLocalDays(date, 1) : date;
  return {
    startAtUtc: riyadhLocalDateTimeToUtc(date, startTime),
    endAtUtc: riyadhLocalDateTimeToUtc(endDate, endTime),
  };
}
