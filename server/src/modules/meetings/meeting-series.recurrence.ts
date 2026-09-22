import { AppError } from "../../shared/errors/app-error.js";
import type { MeetingSeriesPreviewBody } from "./meeting-series.schemas.js";
import {
  addLocalDays,
  addLocalMonthsClamped,
  compareLocalDates,
  formatLocalDate,
  localDateDifferenceInDays,
  meetingSeriesWindowToUtc,
  parseLocalDate,
  sundayOnOrBefore,
  weekdayForLocalDate,
} from "./meeting-series-time.js";
import {
  MEETING_SERIES_MAX_OCCURRENCES,
  MEETING_SERIES_MAX_RANGE_MONTHS,
  type MeetingSeriesInternalConflict,
  type MeetingSeriesOverrideKind,
  type MeetingSeriesResolvedOccurrence,
  type MeetingSeriesWeekday,
} from "./meeting-series.types.js";

interface BaseOccurrence {
  occurrenceKey: string;
  sequenceNumber: number;
  sourceType: "PATTERN" | "CUSTOM";
  originalDate: string;
}

function seriesError(code: string, message: string, details?: unknown): AppError {
  return new AppError({ statusCode: 400, code, message, ...(details === undefined ? {} : { details }) });
}

function assertRangeBounded(startDate: string, candidateEndDate: string): void {
  const maximumEndDate = addLocalMonthsClamped(startDate, MEETING_SERIES_MAX_RANGE_MONTHS);
  if (compareLocalDates(candidateEndDate, maximumEndDate) <= 0) return;

  throw seriesError(
    "MEETING_SERIES_RANGE_TOO_LONG",
    `Meeting Series range cannot exceed ${MEETING_SERIES_MAX_RANGE_MONTHS} months.`,
    { maximumEndDate },
  );
}

function dateForMonthDay(year: number, month: number, dayOfMonth: number): string | null {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (dayOfMonth > lastDay) return null;
  return formatLocalDate({ year, month, day: dayOfMonth });
}

const weekdayNumber: Record<MeetingSeriesWeekday, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function relativeWeekdayDate(
  year: number,
  month: number,
  dayOfWeek: MeetingSeriesWeekday,
  ordinal: 1 | 2 | 3 | 4 | -1,
): string {
  const targetDay = weekdayNumber[dayOfWeek];
  if (ordinal === -1) {
    const lastDay = new Date(Date.UTC(year, month, 0));
    const back = (lastDay.getUTCDay() - targetDay + 7) % 7;
    return formatLocalDate({ year, month, day: lastDay.getUTCDate() - back });
  }

  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const forward = (targetDay - firstDay.getUTCDay() + 7) % 7;
  return formatLocalDate({ year, month, day: 1 + forward + (ordinal - 1) * 7 });
}

function monthAtOffset(startDate: string, monthOffset: number): { year: number; month: number } {
  const start = parseLocalDate(startDate);
  const absoluteMonth = start.year * 12 + (start.month - 1) + monthOffset;
  return {
    year: Math.floor(absoluteMonth / 12),
    month: (absoluteMonth % 12) + 1,
  };
}


function generatePatternDates(schedule: Extract<MeetingSeriesPreviewBody["schedule"], { mode: "PATTERN" }>): string[] {
  const startDate = schedule.range.startDate;
  const maximumEndDate = addLocalMonthsClamped(startDate, MEETING_SERIES_MAX_RANGE_MONTHS);
  const requestedCount = schedule.range.type === "COUNT" ? schedule.range.count : null;
  const requestedEndDate = schedule.range.type === "END_DATE" ? schedule.range.endDate : null;

  if (requestedEndDate) assertRangeBounded(startDate, requestedEndDate);

  const dates: string[] = [];
  const accept = (candidate: string): boolean => {
    if (compareLocalDates(candidate, startDate) < 0) return false;
    if (requestedEndDate && compareLocalDates(candidate, requestedEndDate) > 0) return false;
    if (compareLocalDates(candidate, maximumEndDate) > 0) {
      if (requestedCount !== null && dates.length < requestedCount) {
        throw seriesError(
          "MEETING_SERIES_RANGE_TOO_LONG",
          `Meeting Series range cannot exceed ${MEETING_SERIES_MAX_RANGE_MONTHS} months.`,
          { maximumEndDate },
        );
      }
      return false;
    }

    dates.push(candidate);
    if (dates.length > MEETING_SERIES_MAX_OCCURRENCES) {
      throw seriesError(
        "MEETING_SERIES_TOO_MANY_OCCURRENCES",
        `Meeting Series cannot contain more than ${MEETING_SERIES_MAX_OCCURRENCES} generated Meetings.`,
      );
    }
    return requestedCount !== null && dates.length >= requestedCount;
  };

  const pattern = schedule.pattern;

  if (pattern.type === "DAILY") {
    for (let offset = 0; ; offset += pattern.interval) {
      const candidate = addLocalDays(startDate, offset);
      if (requestedEndDate && compareLocalDates(candidate, requestedEndDate) > 0) break;
      if (compareLocalDates(candidate, maximumEndDate) > 0) {
        if (requestedCount !== null && dates.length < requestedCount) {
          throw seriesError(
            "MEETING_SERIES_RANGE_TOO_LONG",
            `Meeting Series range cannot exceed ${MEETING_SERIES_MAX_RANGE_MONTHS} months.`,
            { maximumEndDate },
          );
        }
        break;
      }
      if (accept(candidate)) break;
    }
  } else if (pattern.type === "WEEKLY") {
    const selectedDays = new Set(pattern.daysOfWeek);
    const anchorSunday = sundayOnOrBefore(startDate);
    for (let candidate = startDate; ; candidate = addLocalDays(candidate, 1)) {
      if (requestedEndDate && compareLocalDates(candidate, requestedEndDate) > 0) break;
      if (compareLocalDates(candidate, maximumEndDate) > 0) {
        if (requestedCount !== null && dates.length < requestedCount) {
          throw seriesError(
            "MEETING_SERIES_RANGE_TOO_LONG",
            `Meeting Series range cannot exceed ${MEETING_SERIES_MAX_RANGE_MONTHS} months.`,
            { maximumEndDate },
          );
        }
        break;
      }

      const weekIndex = Math.floor(localDateDifferenceInDays(anchorSunday, candidate) / 7);
      if (weekIndex % pattern.interval !== 0 || !selectedDays.has(weekdayForLocalDate(candidate))) {
        continue;
      }
      if (accept(candidate)) break;
    }
  } else {
    for (let monthOffset = 0; ; monthOffset += pattern.interval) {
      const { year, month } = monthAtOffset(startDate, monthOffset);
      const candidate =
        pattern.type === "MONTHLY_DATE"
          ? dateForMonthDay(year, month, pattern.dayOfMonth)
          : relativeWeekdayDate(year, month, pattern.dayOfWeek, pattern.ordinal);

      if (!candidate) continue;
      if (requestedEndDate && compareLocalDates(candidate, requestedEndDate) > 0) break;
      if (compareLocalDates(candidate, maximumEndDate) > 0) {
        if (requestedCount !== null && dates.length < requestedCount) {
          throw seriesError(
            "MEETING_SERIES_RANGE_TOO_LONG",
            `Meeting Series range cannot exceed ${MEETING_SERIES_MAX_RANGE_MONTHS} months.`,
            { maximumEndDate },
          );
        }
        break;
      }
      if (compareLocalDates(candidate, startDate) < 0) continue;
      if (accept(candidate)) break;
    }
  }

  if (dates.length === 0) {
    throw seriesError(
      "MEETING_SERIES_NO_OCCURRENCES",
      "The Meeting Series pattern does not generate any Meetings in the selected range.",
    );
  }

  return dates;
}

function buildBaseOccurrences(input: MeetingSeriesPreviewBody): BaseOccurrence[] {
  const dates =
    input.schedule.mode === "PATTERN"
      ? generatePatternDates(input.schedule)
      : [...input.schedule.dates].sort(compareLocalDates);

  if (dates.length > 1) assertRangeBounded(dates[0]!, dates[dates.length - 1]!);

  if (dates.length > MEETING_SERIES_MAX_OCCURRENCES) {
    throw seriesError(
      "MEETING_SERIES_TOO_MANY_OCCURRENCES",
      `Meeting Series cannot contain more than ${MEETING_SERIES_MAX_OCCURRENCES} Meetings.`,
    );
  }

  return dates.map((date, index) => ({
    occurrenceKey: `${input.schedule.mode === "PATTERN" ? "P" : "C"}:${date}:${input.defaults.startTime}`,
    sequenceNumber: index + 1,
    sourceType: input.schedule.mode === "PATTERN" ? "PATTERN" : "CUSTOM",
    originalDate: date,
  }));
}

function equalNumberArrays(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function agendaEquals(
  left: readonly MeetingSeriesPreviewBody["defaults"]["agendaItems"][number][],
  right: readonly MeetingSeriesPreviewBody["defaults"]["agendaItems"][number][],
): boolean {
  const normalize = (
    items: readonly MeetingSeriesPreviewBody["defaults"]["agendaItems"][number][],
  ) =>
    items.map((item) => ({
      topic: item.topic,
      presenterUserId: item.presenterUserId ?? null,
      plannedDurationMinutes: item.plannedDurationMinutes ?? null,
    }));

  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function overrideKindsFor(
  base: Omit<MeetingSeriesResolvedOccurrence, "overrideKinds" | "isCustomized">,
  final: Omit<MeetingSeriesResolvedOccurrence, "overrideKinds" | "isCustomized">,
): MeetingSeriesOverrideKind[] {
  const kinds: MeetingSeriesOverrideKind[] = [];
  if (base.date !== final.date) kinds.push("DATE");
  if (base.startTime !== final.startTime || base.endTime !== final.endTime) kinds.push("TIME");
  if (base.roomId !== final.roomId) kinds.push("ROOM");
  if (base.title !== final.title) kinds.push("TITLE");
  if (base.description !== final.description) kinds.push("DESCRIPTION");
  if (!equalNumberArrays(base.attendeeUserIds, final.attendeeUserIds)) kinds.push("ATTENDEES");
  if (base.organizerAttending !== final.organizerAttending) kinds.push("ORGANIZER_ATTENDANCE");
  if (!agendaEquals(base.agendaItems, final.agendaItems)) kinds.push("AGENDA");
  return kinds;
}

function occurrenceFromBase(
  base: BaseOccurrence,
  input: MeetingSeriesPreviewBody,
): Omit<MeetingSeriesResolvedOccurrence, "overrideKinds" | "isCustomized"> {
  const originalWindow = meetingSeriesWindowToUtc(
    base.originalDate,
    input.defaults.startTime,
    input.defaults.endTime,
  );

  return {
    occurrenceKey: base.occurrenceKey,
    sequenceNumber: base.sequenceNumber,
    sourceType: base.sourceType,
    originalDate: base.originalDate,
    originalStartTime: input.defaults.startTime,
    originalEndTime: input.defaults.endTime,
    originalStartAtUtc: originalWindow.startAtUtc.toISOString(),
    originalEndAtUtc: originalWindow.endAtUtc.toISOString(),
    date: base.originalDate,
    startTime: input.defaults.startTime,
    endTime: input.defaults.endTime,
    startAtUtc: originalWindow.startAtUtc.toISOString(),
    endAtUtc: originalWindow.endAtUtc.toISOString(),
    roomId: input.defaults.roomId,
    title: input.defaults.title,
    description: input.defaults.description,
    organizerAttending: input.defaults.organizerAttending,
    attendeeUserIds: [...input.defaults.attendeeUserIds],
    agendaItems: input.defaults.agendaItems.map((item) => ({ ...item })),
  };
}

function applyOverride(
  base: Omit<MeetingSeriesResolvedOccurrence, "overrideKinds" | "isCustomized">,
  exception: Extract<MeetingSeriesPreviewBody["exceptions"][number], { action: "OVERRIDE" }>,
): MeetingSeriesResolvedOccurrence {
  const finalDate = exception.date ?? base.date;
  const finalStartTime = exception.startTime ?? base.startTime;
  const finalEndTime = exception.endTime ?? base.endTime;
  const window = meetingSeriesWindowToUtc(finalDate, finalStartTime, finalEndTime);
  const final = {
    ...base,
    date: finalDate,
    startTime: finalStartTime,
    endTime: finalEndTime,
    startAtUtc: window.startAtUtc.toISOString(),
    endAtUtc: window.endAtUtc.toISOString(),
    roomId: exception.roomId ?? base.roomId,
    title: exception.title ?? base.title,
    description: exception.description !== undefined ? exception.description : base.description,
    organizerAttending: exception.organizerAttending ?? base.organizerAttending,
    attendeeUserIds: exception.attendeeUserIds ? [...exception.attendeeUserIds] : base.attendeeUserIds,
    agendaItems: exception.agendaItems
      ? exception.agendaItems.map((item) => ({ ...item }))
      : base.agendaItems,
  };
  const overrideKinds = overrideKindsFor(base, final);
  return { ...final, overrideKinds, isCustomized: overrideKinds.length > 0 };
}

function addedOccurrence(
  sequenceNumber: number,
  input: MeetingSeriesPreviewBody,
  exception: Extract<MeetingSeriesPreviewBody["exceptions"][number], { action: "ADD" }>,
): MeetingSeriesResolvedOccurrence {
  const startTime = exception.startTime ?? input.defaults.startTime;
  const endTime = exception.endTime ?? input.defaults.endTime;
  const window = meetingSeriesWindowToUtc(exception.date, startTime, endTime);
  const occurrence: Omit<MeetingSeriesResolvedOccurrence, "overrideKinds" | "isCustomized"> = {
    occurrenceKey: `A:${exception.clientOccurrenceId.toLowerCase()}`,
    sequenceNumber,
    sourceType: "ADDED",
    originalDate: null,
    originalStartTime: null,
    originalEndTime: null,
    originalStartAtUtc: null,
    originalEndAtUtc: null,
    date: exception.date,
    startTime,
    endTime,
    startAtUtc: window.startAtUtc.toISOString(),
    endAtUtc: window.endAtUtc.toISOString(),
    roomId: exception.roomId ?? input.defaults.roomId,
    title: exception.title ?? input.defaults.title,
    description:
      exception.description !== undefined ? exception.description : input.defaults.description,
    organizerAttending: exception.organizerAttending ?? input.defaults.organizerAttending,
    attendeeUserIds: exception.attendeeUserIds
      ? [...exception.attendeeUserIds]
      : [...input.defaults.attendeeUserIds],
    agendaItems: exception.agendaItems
      ? exception.agendaItems.map((item) => ({ ...item }))
      : input.defaults.agendaItems.map((item) => ({ ...item })),
  };

  const defaultsAsOccurrence: typeof occurrence = {
    ...occurrence,
    roomId: input.defaults.roomId,
    title: input.defaults.title,
    description: input.defaults.description,
    organizerAttending: input.defaults.organizerAttending,
    attendeeUserIds: [...input.defaults.attendeeUserIds],
    agendaItems: input.defaults.agendaItems.map((item) => ({ ...item })),
  };
  const overrideKinds = overrideKindsFor(defaultsAsOccurrence, occurrence);
  return { ...occurrence, overrideKinds, isCustomized: true };
}

export function resolveMeetingSeriesOccurrences(
  input: MeetingSeriesPreviewBody,
): MeetingSeriesResolvedOccurrence[] {
  const bases = buildBaseOccurrences(input);
  const baseByKey = new Map(bases.map((base) => [base.occurrenceKey, base] as const));
  const removedKeys = new Set<string>();
  const overrideByKey = new Map<
    string,
    Extract<MeetingSeriesPreviewBody["exceptions"][number], { action: "OVERRIDE" }>
  >();
  const additions: MeetingSeriesResolvedOccurrence[] = [];
  const touchedKeys = new Set<string>();

  for (const exception of input.exceptions) {
    if (exception.action === "ADD") {
      const additionKey = `A:${exception.clientOccurrenceId.toLowerCase()}`;
      if (additions.some((item) => item.occurrenceKey === additionKey)) {
        throw seriesError(
          "MEETING_SERIES_DUPLICATE_OCCURRENCE_EXCEPTION",
          "A Meeting Series custom occurrence ID was supplied more than once.",
          { occurrenceKey: additionKey },
        );
      }
      additions.push(addedOccurrence(bases.length + additions.length + 1, input, exception));
      continue;
    }

    if (!baseByKey.has(exception.occurrenceKey)) {
      throw seriesError(
        "MEETING_SERIES_OCCURRENCE_NOT_FOUND",
        "A Meeting Series exception references an occurrence that is not generated by the current schedule.",
        { occurrenceKey: exception.occurrenceKey },
      );
    }
    if (touchedKeys.has(exception.occurrenceKey)) {
      throw seriesError(
        "MEETING_SERIES_DUPLICATE_OCCURRENCE_EXCEPTION",
        "A generated Meeting occurrence may have only one remove/override exception.",
        { occurrenceKey: exception.occurrenceKey },
      );
    }
    touchedKeys.add(exception.occurrenceKey);

    if (exception.action === "REMOVE") {
      removedKeys.add(exception.occurrenceKey);
    } else {
      overrideByKey.set(exception.occurrenceKey, exception);
    }
  }

  const resolved = bases
    .filter((base) => !removedKeys.has(base.occurrenceKey))
    .map((base): MeetingSeriesResolvedOccurrence => {
      const occurrence = occurrenceFromBase(base, input);
      const override = overrideByKey.get(base.occurrenceKey);
      if (override) return applyOverride(occurrence, override);
      return { ...occurrence, overrideKinds: [], isCustomized: false };
    });

  const finalResolved = [...resolved, ...additions];
  if (finalResolved.length === 0) {
    throw seriesError(
      "MEETING_SERIES_NO_OCCURRENCES",
      "Meeting Series must contain at least one Meeting after removals are applied.",
    );
  }
  if (finalResolved.length > MEETING_SERIES_MAX_OCCURRENCES) {
    throw seriesError(
      "MEETING_SERIES_TOO_MANY_OCCURRENCES",
      `Meeting Series cannot contain more than ${MEETING_SERIES_MAX_OCCURRENCES} Meetings.`,
    );
  }


  const orderedDates = finalResolved.map((occurrence) => occurrence.date).sort(compareLocalDates);
  if (orderedDates.length > 1) {
    assertRangeBounded(orderedDates[0]!, orderedDates[orderedDates.length - 1]!);
  }

  // Sequence is a Series identity, not a chronological sort key. Moving one occurrence
  // to a different day must not silently change which Series position it represents.
  return finalResolved.map((occurrence, index) => ({ ...occurrence, sequenceNumber: index + 1 }));
}

export function findMeetingSeriesInternalConflicts(
  occurrences: readonly MeetingSeriesResolvedOccurrence[],
): MeetingSeriesInternalConflict[] {
  const conflicts: MeetingSeriesInternalConflict[] = [];

  for (let leftIndex = 0; leftIndex < occurrences.length; leftIndex += 1) {
    const left = occurrences[leftIndex];
    if (!left) continue;
    const leftStart = new Date(left.startAtUtc).getTime();
    const leftEnd = new Date(left.endAtUtc).getTime();

    for (let rightIndex = leftIndex + 1; rightIndex < occurrences.length; rightIndex += 1) {
      const right = occurrences[rightIndex];
      if (!right || right.roomId !== left.roomId) continue;
      const rightStart = new Date(right.startAtUtc).getTime();
      const rightEnd = new Date(right.endAtUtc).getTime();
      if (leftStart >= rightEnd || leftEnd <= rightStart) continue;

      conflicts.push({
        roomId: left.roomId,
        firstOccurrenceKey: left.occurrenceKey,
        secondOccurrenceKey: right.occurrenceKey,
      });
    }
  }

  return conflicts;
}

