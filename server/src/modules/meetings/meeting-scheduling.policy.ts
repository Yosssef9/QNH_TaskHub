import { AppError } from "../../shared/errors/app-error.js";

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

export function assertParticipantCount(participantCount: number): void {
  if (!Number.isInteger(participantCount) || participantCount < 1) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_PARTICIPANT_COUNT",
      message: "Meeting participant count must be at least one.",
    });
  }
}
