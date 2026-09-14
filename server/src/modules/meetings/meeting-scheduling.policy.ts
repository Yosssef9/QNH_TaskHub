import { AppError } from "../../shared/errors/app-error.js";

export const MEETING_SCHEDULE_STEP_MINUTES = 15;

export function hasRoomCapacity(capacity: number, participantCount: number): boolean {
  return participantCount <= capacity;
}

export function assertScheduleWindow(startAtUtc: Date, endAtUtc: Date): void {
  if (
    Number.isNaN(startAtUtc.getTime()) ||
    Number.isNaN(endAtUtc.getTime()) ||
    endAtUtc.getTime() <= startAtUtc.getTime()
  ) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_SCHEDULE_WINDOW",
      message: "Meeting end time must be after its start time.",
    });
  }
}

function isQuarterHourBoundary(value: Date): boolean {
  return (
    value.getUTCMinutes() % MEETING_SCHEDULE_STEP_MINUTES === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  );
}

export function assertSchedulableMeetingWindow(
  startAtUtc: Date,
  endAtUtc: Date,
  nowUtc = new Date(),
): void {
  assertScheduleWindow(startAtUtc, endAtUtc);

  if (!isQuarterHourBoundary(startAtUtc) || !isQuarterHourBoundary(endAtUtc)) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_TIME_INCREMENT",
      message: "Meeting start and end times must use 15-minute increments.",
    });
  }

  if (startAtUtc.getTime() <= nowUtc.getTime()) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_SCHEDULE_IN_PAST",
      message: "Meeting start time has already passed. Choose a future time.",
    });
  }
}


export function assertMeetingHasNotStarted(startAtUtc: Date, nowUtc = new Date()): void {
  if (Number.isNaN(startAtUtc.getTime())) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_WORKSPACE_STALE",
      message: "Meeting schedule is no longer available. Reload and try again.",
    });
  }

  if (startAtUtc.getTime() <= nowUtc.getTime()) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_ALREADY_STARTED",
      message: "This Meeting has already started and can no longer be cancelled or rescheduled.",
    });
  }
}

export function assertParticipantCount(participantCount: number): void {
  if (!Number.isInteger(participantCount) || participantCount < 1) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_PARTICIPANT_COUNT",
      message: "Meeting participant count must be at least one.",
    });
  }
}

