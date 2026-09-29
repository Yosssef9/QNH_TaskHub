import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  assertParticipantCount,
  assertSchedulableMeetingWindow,
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
  MeetingParticipantAvailability,
  MeetingParticipantAvailabilityViewer,
  MeetingParticipantConflictInput,
  MeetingParticipantConflictMeetingDetail,
  MeetingParticipantConflictMeetingResult,
  MeetingParticipantConflictMeetingWindow,
  MeetingParticipantScheduleConflict,
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

async function assertZoomOrganizerPermission(
  transaction: DatabaseTransaction,
  actorUserId: number,
): Promise<void> {
  const allowed = await meetingSchedulingRepository.hasActiveMeetingPermission(
    transaction,
    actorUserId,
    "MEETING_ORGANIZE_ZOOM",
  );
  if (allowed) return;

  throw new AppError({
    statusCode: 403,
    code: "ZOOM_MEETING_ORGANIZER_REQUIRED",
    message: "Zoom Meeting Organizer permission is required for this operation.",
  });
}

function sameConcurrencySnapshot(
  beforeLock: RevisionScheduleRecord,
  afterLock: RevisionScheduleRecord,
): boolean {
  return (
    beforeLock.meetingRowVersion === afterLock.meetingRowVersion &&
    beforeLock.revisionRowVersion === afterLock.revisionRowVersion &&
    beforeLock.meetingMode === afterLock.meetingMode &&
    beforeLock.roomId === afterLock.roomId &&
    beforeLock.onlineJoinUrl === afterLock.onlineJoinUrl &&
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
  assertSchedulableMeetingWindow(input.startAtUtc, input.endAtUtc);
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

async function commitRevisionInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  meetingId: number,
  revisionId: number,
  expectedRevisionRowVersion: string | undefined,
  authority: "COORDINATOR" | "ZOOM_ORGANIZER",
): Promise<ScheduledRevisionResult> {
  if (authority === "COORDINATOR") await assertCoordinatorPermission(transaction, actorUserId);
  else await assertZoomOrganizerPermission(transaction, actorUserId);

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
  if (expectedRevisionRowVersion !== undefined && beforeLock.revisionRowVersion !== expectedRevisionRowVersion) {
    throw staleSchedule();
  }
  if (!["PENDING_APPROVAL", "SCHEDULED"].includes(beforeLock.meetingStatus)) throw staleSchedule();
  if (authority === "COORDINATOR" && beforeLock.meetingMode !== "ROOM") {
    throw new AppError({
      statusCode: 409,
      code: "ZOOM_MEETING_DOES_NOT_REQUIRE_COORDINATOR",
      message: "Zoom Meetings are scheduled directly by a Zoom Meeting Organizer.",
    });
  }
  if (authority === "ZOOM_ORGANIZER" && beforeLock.meetingMode !== "ZOOM") throw staleSchedule();

  if (beforeLock.meetingMode === "ROOM") {
    if (beforeLock.roomId === null) throw staleSchedule();
    assertRoomLock(await meetingSchedulingRepository.acquireRoomLock(transaction, beforeLock.roomId));
  }

  const afterLock = await meetingSchedulingRepository.findRevisionSchedule(
    transaction,
    meetingId,
    revisionId,
  );
  if (!afterLock || !sameConcurrencySnapshot(beforeLock, afterLock)) throw staleSchedule();

  assertSchedulableMeetingWindow(afterLock.startAtUtc, afterLock.endAtUtc);

  const participantCount = await meetingSchedulingRepository.countMeetingParticipants(transaction, meetingId);
  if (participantCount < 1) throw staleSchedule();

  if (afterLock.meetingMode === "ROOM") {
    if (afterLock.roomId === null || afterLock.onlineJoinUrl !== null) throw staleSchedule();
    const room = await meetingSchedulingRepository.findRoomForScheduling(transaction, afterLock.roomId);
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
  } else if (!afterLock.onlineJoinUrl || afterLock.roomId !== null) {
    throw staleSchedule();
  }

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

  const activityType =
    afterLock.meetingMode === "ZOOM"
      ? afterLock.revisionType === "RESCHEDULE"
        ? "ZOOM_RESCHEDULED"
        : "ZOOM_SCHEDULED"
      : afterLock.revisionType === "RESCHEDULE"
        ? "RESCHEDULE_APPROVED"
        : "APPROVED";

  await meetingSchedulingRepository.addActivity(transaction, meetingId, actorUserId, activityType, {
    revisionId,
    meetingMode: afterLock.meetingMode,
    roomId: afterLock.roomId,
    startAtUtc: afterLock.startAtUtc.toISOString(),
    endAtUtc: afterLock.endAtUtc.toISOString(),
    participantCount,
  });

  return {
    meetingId,
    revisionId,
    meetingMode: afterLock.meetingMode,
    roomId: afterLock.roomId,
    onlineJoinUrl: afterLock.onlineJoinUrl,
    startAtUtc: afterLock.startAtUtc,
    endAtUtc: afterLock.endAtUtc,
    participantCount,
  };
}

async function commitPendingRevisionInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  meetingId: number,
  revisionId: number,
  expectedRevisionRowVersion?: string,
): Promise<ScheduledRevisionResult> {
  return commitRevisionInTransaction(
    transaction, actorUserId, meetingId, revisionId, expectedRevisionRowVersion, "COORDINATOR",
  );
}

async function commitZoomRevisionInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  meetingId: number,
  revisionId: number,
  expectedRevisionRowVersion?: string,
): Promise<ScheduledRevisionResult> {
  return commitRevisionInTransaction(
    transaction, actorUserId, meetingId, revisionId, expectedRevisionRowVersion, "ZOOM_ORGANIZER",
  );
}

const MAX_CONFLICT_WINDOWS_PER_PARTICIPANT = 3;

function mapVisibleConflictMeetings(
  rows: readonly import("./meeting-scheduling.repository.js").ParticipantConflictVisibleMeetingRecord[],
): Map<number, MeetingParticipantConflictMeetingDetail> {
  const visible = new Map<number, MeetingParticipantConflictMeetingDetail>();

  for (const row of rows) {
    const meetingId = Number(row.meetingId);
    const room =
      row.roomId === null ||
      row.roomNameAr === null ||
      row.roomNameEn === null ||
      row.roomColorKey === null
        ? null
        : {
            id: Number(row.roomId),
            code: row.roomCode,
            nameAr: row.roomNameAr,
            nameEn: row.roomNameEn,
            locationText: row.roomLocationText,
            colorKey: row.roomColorKey,
          };

    visible.set(meetingId, {
      visibility: row.visibility,
      meetingId: row.visibility === "FULL" ? meetingId : null,
      title: row.title,
      meetingMode: row.meetingMode,
      organizer: {
        userId: Number(row.organizerUserId),
        userCode: row.organizerUserCode,
        userName: row.organizerUserName,
      },
      room,
    });
  }

  return visible;
}

function projectParticipantConflicts(
  rows: readonly import("./meeting-scheduling.repository.js").ParticipantScheduleConflictRecord[],
  visibleMeetings: ReadonlyMap<number, MeetingParticipantConflictMeetingDetail> = new Map(),
): MeetingParticipantScheduleConflict[] {
  const byUser = new Map<number, MeetingParticipantScheduleConflict>();

  for (const row of rows) {
    const userId = Number(row.userId);
    let conflict = byUser.get(userId);
    if (!conflict) {
      conflict = {
        participant: {
          userId,
          userCode: row.userCode,
          userName: row.userName,
        },
        conflictCount: 0,
        overlaps: [],
      };
      byUser.set(userId, conflict);
    }

    conflict.conflictCount += 1;
    if (conflict.overlaps.length < MAX_CONFLICT_WINDOWS_PER_PARTICIPANT) {
      conflict.overlaps.push({
        startAtUtc: row.startAtUtc.toISOString(),
        endAtUtc: row.endAtUtc.toISOString(),
        meeting: visibleMeetings.get(Number(row.meetingId)) ?? null,
      });
    }
  }

  return [...byUser.values()].sort((left, right) =>
    left.participant.userName.localeCompare(right.participant.userName),
  );
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

  async getParticipantAvailability(
    input: MeetingParticipantConflictInput,
    viewer?: MeetingParticipantAvailabilityViewer,
  ): Promise<MeetingParticipantAvailability> {
    const startAtUtc = new Date(input.startAtUtc);
    const endAtUtc = new Date(input.endAtUtc);
    assertScheduleWindow(startAtUtc, endAtUtc);

    const participantUserIds = [...new Set(input.participantUserIds)].filter(
      (userId) => Number.isSafeInteger(userId) && userId > 0,
    );
    const excludeMeetingId = input.excludeMeetingId ?? null;

    const conflictRows = await meetingSchedulingRepository.findParticipantScheduleConflicts({
      participantUserIds,
      startAtUtc,
      endAtUtc,
      excludeMeetingId,
    });

    let visibleMeetings = new Map<number, MeetingParticipantConflictMeetingDetail>();
    if (viewer && conflictRows.length > 0) {
      visibleMeetings = mapVisibleConflictMeetings(
        await meetingSchedulingRepository.findVisibleParticipantConflictMeetings({
          viewerUserId: viewer.userId,
          participantUserIds,
          startAtUtc,
          endAtUtc,
          excludeMeetingId,
          canCoordinateMeetings: viewer.canCoordinateMeetings,
          canPreviewRoomMeetings: viewer.canPreviewRoomMeetings,
        }),
      );
    }

    const conflicts = projectParticipantConflicts(conflictRows, visibleMeetings);

    return {
      startAtUtc: startAtUtc.toISOString(),
      endAtUtc: endAtUtc.toISOString(),
      participantCount: participantUserIds.length,
      conflictParticipantCount: conflicts.length,
      conflicts,
    };
  },

  async getParticipantConflictsForMeetingWindows(input: {
    participantUserId: number;
    meetings: readonly MeetingParticipantConflictMeetingWindow[];
  }): Promise<MeetingParticipantConflictMeetingResult[]> {
    const meetings = input.meetings
      .filter((meeting) => Number.isSafeInteger(meeting.meetingId) && meeting.meetingId > 0)
      .map((meeting) => ({
        meetingId: meeting.meetingId,
        startAtUtc: new Date(meeting.startAtUtc),
        endAtUtc: new Date(meeting.endAtUtc),
      }));

    for (const meeting of meetings) assertScheduleWindow(meeting.startAtUtc, meeting.endAtUtc);
    if (meetings.length === 0) return [];

    const rows = await meetingSchedulingRepository.findParticipantScheduleConflictsForMeetings({
      participantUserId: input.participantUserId,
      meetings,
    });
    const byMeeting = new Map<number, MeetingParticipantConflictMeetingResult>();
    for (const row of rows) {
      const meetingId = Number(row.targetMeetingId);
      const current = byMeeting.get(meetingId) ?? {
        meetingId,
        conflictCount: Number(row.conflictCount),
        overlaps: [],
      };
      current.conflictCount = Number(row.conflictCount);
      current.overlaps.push({
        startAtUtc: row.startAtUtc.toISOString(),
        endAtUtc: row.endAtUtc.toISOString(),
      });
      byMeeting.set(meetingId, current);
    }
    return [...byMeeting.values()];
  },

  async assertCoordinatorPermission(
    transaction: DatabaseTransaction,
    actorUserId: number,
  ): Promise<void> {
    await assertCoordinatorPermission(transaction, actorUserId);
  },

  async assertZoomOrganizerPermission(
    transaction: DatabaseTransaction,
    actorUserId: number,
  ): Promise<void> {
    await assertZoomOrganizerPermission(transaction, actorUserId);
  },

  async acquireRoomLocksInTransaction(
    transaction: DatabaseTransaction,
    roomIds: readonly number[],
  ): Promise<void> {
    const orderedRoomIds = [...new Set(roomIds)].sort((left, right) => left - right);
    for (const roomId of orderedRoomIds) {
      assertRoomLock(await meetingSchedulingRepository.acquireRoomLock(transaction, roomId));
    }
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
    expectedRevisionRowVersion?: string,
  ): Promise<ScheduledRevisionResult> {
    return withTransaction((transaction) =>
      commitPendingRevisionInTransaction(
        transaction,
        actorUserId,
        meetingId,
        revisionId,
        expectedRevisionRowVersion,
      ),
    );
  },

  async commitPendingRevisionInTransaction(
    transaction: DatabaseTransaction,
    actorUserId: number,
    meetingId: number,
    revisionId: number,
    expectedRevisionRowVersion?: string,
  ): Promise<ScheduledRevisionResult> {
    return commitPendingRevisionInTransaction(
      transaction,
      actorUserId,
      meetingId,
      revisionId,
      expectedRevisionRowVersion,
    );
  },

  async commitZoomRevisionInTransaction(
    transaction: DatabaseTransaction,
    actorUserId: number,
    meetingId: number,
    revisionId: number,
    expectedRevisionRowVersion?: string,
  ): Promise<ScheduledRevisionResult> {
    return commitZoomRevisionInTransaction(
      transaction,
      actorUserId,
      meetingId,
      revisionId,
      expectedRevisionRowVersion,
    );
  },
};
