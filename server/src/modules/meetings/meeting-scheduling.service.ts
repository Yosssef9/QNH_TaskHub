import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  assertParticipantCount,
  assertScheduleWindow,
  hasRoomCapacity,
} from "./meeting-scheduling.policy.js";
import {
  meetingSchedulingRepository,
  type RevisionScheduleRecord,
} from "./meeting-scheduling.repository.js";
import type {
  LockedScheduleInput,
  MeetingAvailability,
  MeetingAvailabilityInput,
  ScheduledRevisionResult,
} from "./meeting-scheduling.types.js";

function roomNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_ROOM_NOT_FOUND",
    message: "Meeting Room was not found.",
  });
}

function staleSchedule(): AppError {
  return new AppError({
    statusCode: 409,
    code: "MEETING_SCHEDULE_STALE",
    message: "Meeting scheduling data changed after it was loaded. Reload and try again.",
  });
}

function assertRoomLock(lockResult: number): void {
  if (lockResult >= 0) return;

  throw new AppError({
    statusCode: 409,
    code: "MEETING_ROOM_SCHEDULE_BUSY",
    message: "This Meeting Room is being scheduled by another operation. Try again.",
  });
}

function assertRoomCanSchedule(isActive: boolean): void {
  if (isActive) return;

  throw new AppError({
    statusCode: 409,
    code: "ACTIVE_MEETING_ROOM_REQUIRED",
    message: "Choose an active Meeting Room before scheduling the Meeting.",
  });
}

function assertCapacity(capacity: number, participantCount: number): void {
  if (hasRoomCapacity(capacity, participantCount)) return;

  throw new AppError({
    statusCode: 409,
    code: "MEETING_ROOM_CAPACITY_EXCEEDED",
    message: "The selected Meeting Room does not have enough capacity for all participants.",
    details: { capacity, participantCount },
  });
}

function assertNoConflict(conflictCount: number): void {
  if (conflictCount === 0) return;

  throw new AppError({
    statusCode: 409,
    code: "MEETING_ROOM_TIME_CONFLICT",
    message: "The selected Meeting Room is already reserved during this time.",
  });
}


async function assertCoordinatorPermission(
  transaction: DatabaseTransaction,
  actorUserId: number,
): Promise<void> {
  const allowed = await meetingSchedulingRepository.hasActiveMeetingPermission(
    transaction,
    actorUserId,
    "MEETING_COORDINATE",
  );
  if (allowed) return;

  throw new AppError({
    statusCode: 403,
    code: "FORBIDDEN",
    message: "Meeting Coordinator permission is required for this scheduling operation.",
  });
}

function sameConcurrencySnapshot(
  beforeLock: RevisionScheduleRecord,
  afterLock: RevisionScheduleRecord,
): boolean {
  return (
    beforeLock.meetingRowVersion === afterLock.meetingRowVersion &&
    beforeLock.revisionRowVersion === afterLock.revisionRowVersion &&
    beforeLock.roomId === afterLock.roomId &&
    beforeLock.startAtUtc.getTime() === afterLock.startAtUtc.getTime() &&
    beforeLock.endAtUtc.getTime() === afterLock.endAtUtc.getTime() &&
    beforeLock.revisionStatus === afterLock.revisionStatus &&
    beforeLock.meetingStatus === afterLock.meetingStatus &&
    beforeLock.currentRevisionId === afterLock.currentRevisionId
  );
}

async function assertLockedScheduleAvailable(
  transaction: DatabaseTransaction,
  input: LockedScheduleInput,
): Promise<void> {
  assertScheduleWindow(input.startAtUtc, input.endAtUtc);
  assertParticipantCount(input.participantCount);

  assertRoomLock(await meetingSchedulingRepository.acquireRoomLock(transaction, input.roomId));

  const room = await meetingSchedulingRepository.findRoomForScheduling(transaction, input.roomId);
  if (!room) throw roomNotFound();
  assertRoomCanSchedule(Boolean(room.isActive));
  assertCapacity(Number(room.capacity), input.participantCount);

  const conflicts = await meetingSchedulingRepository.countConflictsInTransaction(
    transaction,
    input.roomId,
    input.startAtUtc,
    input.endAtUtc,
    input.excludeMeetingId ?? null,
  );
  assertNoConflict(conflicts);
}

async function commitPendingRevisionInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  meetingId: number,
  revisionId: number,
): Promise<ScheduledRevisionResult> {
  await assertCoordinatorPermission(transaction, actorUserId);

  const beforeLock = await meetingSchedulingRepository.findRevisionSchedule(
    transaction,
    meetingId,
    revisionId,
  );
  if (!beforeLock) {
    throw new AppError({
      statusCode: 404,
      code: "MEETING_REVISION_NOT_FOUND",
      message: "Meeting scheduling revision was not found.",
    });
  }
  if (beforeLock.revisionStatus !== "PENDING") throw staleSchedule();
  if (!["PENDING_APPROVAL", "SCHEDULED"].includes(beforeLock.meetingStatus)) {
    throw staleSchedule();
  }

  assertRoomLock(await meetingSchedulingRepository.acquireRoomLock(transaction, beforeLock.roomId));

  const afterLock = await meetingSchedulingRepository.findRevisionSchedule(
    transaction,
    meetingId,
    revisionId,
  );
  if (!afterLock || !sameConcurrencySnapshot(beforeLock, afterLock)) throw staleSchedule();

  const participantCount = await meetingSchedulingRepository.countMeetingParticipants(
    transaction,
    meetingId,
  );
  if (participantCount < 1) throw staleSchedule();

  const room = await meetingSchedulingRepository.findRoomForScheduling(
    transaction,
    afterLock.roomId,
  );
  if (!room) throw roomNotFound();
  assertRoomCanSchedule(Boolean(room.isActive));
  assertCapacity(Number(room.capacity), participantCount);

  const conflictCount = await meetingSchedulingRepository.countConflictsInTransaction(
    transaction,
    afterLock.roomId,
    afterLock.startAtUtc,
    afterLock.endAtUtc,
    meetingId,
  );
  assertNoConflict(conflictCount);

  const revisionUpdated = await meetingSchedulingRepository.approveRevision(
    transaction,
    meetingId,
    revisionId,
    afterLock.revisionRowVersion,
    actorUserId,
  );
  if (!revisionUpdated) throw staleSchedule();

  const meetingUpdated = await meetingSchedulingRepository.activateRevision(
    transaction,
    meetingId,
    revisionId,
    afterLock.meetingRowVersion,
  );
  if (!meetingUpdated) throw staleSchedule();

  await meetingSchedulingRepository.addActivity(
    transaction,
    meetingId,
    actorUserId,
    afterLock.revisionType === "RESCHEDULE" ? "RESCHEDULE_APPROVED" : "SCHEDULED",
    {
      revisionId,
      roomId: afterLock.roomId,
      startAtUtc: afterLock.startAtUtc.toISOString(),
      endAtUtc: afterLock.endAtUtc.toISOString(),
      participantCount,
    },
  );

  return {
    meetingId,
    revisionId,
    roomId: afterLock.roomId,
    startAtUtc: afterLock.startAtUtc,
    endAtUtc: afterLock.endAtUtc,
    participantCount,
  };

}

export const meetingSchedulingService = {
  async getAvailability(input: MeetingAvailabilityInput): Promise<MeetingAvailability> {
    const startAtUtc = new Date(input.startAtUtc);
    const endAtUtc = new Date(input.endAtUtc);
    assertScheduleWindow(startAtUtc, endAtUtc);
    assertParticipantCount(input.participantCount);

    const room = await meetingSchedulingRepository.findRoomForAvailability(input.roomId);
    if (!room) throw roomNotFound();

    const conflictCount = await meetingSchedulingRepository.countConflicts(
      input.roomId,
      startAtUtc,
      endAtUtc,
      null,
    );
    const isRoomActive = Boolean(room.isActive);
    const roomCapacity = Number(room.capacity);
    const hasCapacity = hasRoomCapacity(roomCapacity, input.participantCount);
    const isAvailable = conflictCount === 0;

    return {
      roomId: input.roomId,
      startAtUtc: startAtUtc.toISOString(),
      endAtUtc: endAtUtc.toISOString(),
      participantCount: input.participantCount,
      roomCapacity,
      isRoomActive,
      hasCapacity,
      isAvailable,
      canSchedule: isRoomActive && hasCapacity && isAvailable,
    };
  },

  async assertCoordinatorPermission(
    transaction: DatabaseTransaction,
    actorUserId: number,
  ): Promise<void> {
    await assertCoordinatorPermission(transaction, actorUserId);
  },

  async assertLockedScheduleAvailable(
    transaction: DatabaseTransaction,
    input: LockedScheduleInput,
  ): Promise<void> {
    await assertLockedScheduleAvailable(transaction, input);
  },

  async commitPendingRevision(
    actorUserId: number,
    meetingId: number,
    revisionId: number,
  ): Promise<ScheduledRevisionResult> {
    return withTransaction((transaction) =>
      commitPendingRevisionInTransaction(transaction, actorUserId, meetingId, revisionId),
    );
  },

  async commitPendingRevisionInTransaction(
    transaction: DatabaseTransaction,
    actorUserId: number,
    meetingId: number,
    revisionId: number,
  ): Promise<ScheduledRevisionResult> {
    return commitPendingRevisionInTransaction(transaction, actorUserId, meetingId, revisionId);
  },
};
