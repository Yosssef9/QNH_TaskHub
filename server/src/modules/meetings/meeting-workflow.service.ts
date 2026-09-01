import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import { assertScheduleWindow } from "./meeting-scheduling.policy.js";
import { meetingSchedulingRepository } from "./meeting-scheduling.repository.js";
import { meetingSchedulingService } from "./meeting-scheduling.service.js";
import { meetingWorkflowRepository } from "./meeting-workflow.repository.js";
import type {
  CreateMeetingInput,
  DecideMeetingRequestInput,
  MeetingParticipantList,
  MeetingScheduleEntry,
  MeetingSummary,
  RejectMeetingRequestInput,
  UpdatePendingMeetingScheduleInput,
} from "./meeting-workflow.types.js";
import { meetingScheduleVisibility } from "./meetings.policy.js";

function invalidAttendee(): AppError {
  return new AppError({
    statusCode: 400,
    code: "INVALID_MEETING_ATTENDEE",
    message: "One or more selected attendees are not active TaskHub users.",
  });
}

function meetingCreateFailed(): AppError {
  return new AppError({
    statusCode: 500,
    code: "MEETING_CREATE_FAILED",
    message: "Meeting could not be created.",
  });
}

function meetingRequestNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_REQUEST_NOT_FOUND",
    message: "Meeting request was not found.",
  });
}

function staleRequest(): AppError {
  return new AppError({
    statusCode: 409,
    code: "MEETING_REQUEST_STALE",
    message: "Meeting request changed after it was loaded. Reload and try again.",
  });
}

function normalizeAttendeeIds(actorUserId: number, attendeeUserIds: readonly number[]): number[] {
  return [...new Set(attendeeUserIds)].filter((userId) => userId !== actorUserId);
}

async function assertActiveAttendees(
  transaction: DatabaseTransaction,
  actorUserId: number,
  attendeeUserIds: readonly number[],
): Promise<number[]> {
  const normalized = normalizeAttendeeIds(actorUserId, attendeeUserIds);
  const active = await meetingWorkflowRepository.activeParticipantIds(transaction, normalized);
  if (active.length !== normalized.length) throw invalidAttendee();

  return normalized;
}

async function assertEffectiveOrganizerPermission(
  transaction: DatabaseTransaction,
  actorUserId: number,
): Promise<void> {
  const [organize, coordinate] = await Promise.all([
    meetingSchedulingRepository.hasActiveMeetingPermission(
      transaction,
      actorUserId,
      "MEETING_ORGANIZE",
    ),
    meetingSchedulingRepository.hasActiveMeetingPermission(
      transaction,
      actorUserId,
      "MEETING_COORDINATE",
    ),
  ]);

  if (organize || coordinate) return;

  throw new AppError({
    statusCode: 403,
    code: "FORBIDDEN",
    message: "Meeting Organizer permission is required for this operation.",
  });
}

async function assertActiveRequestedRoom(
  transaction: DatabaseTransaction,
  roomId: number,
): Promise<void> {
  const room = await meetingSchedulingRepository.findRoomForScheduling(transaction, roomId);
  if (!room) {
    throw new AppError({
      statusCode: 404,
      code: "MEETING_ROOM_NOT_FOUND",
      message: "Meeting Room was not found.",
    });
  }

  if (!Boolean(room.isActive)) {
    throw new AppError({
      statusCode: 409,
      code: "ACTIVE_MEETING_ROOM_REQUIRED",
      message: "Choose an active Meeting Room.",
    });
  }
}

async function createPendingMeetingInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  input: CreateMeetingInput,
  activityType: "REQUESTED" | "DIRECT_CREATED",
): Promise<{ meetingId: number; revisionId: number; revisionRowVersion: string }> {
  const startAtUtc = new Date(input.startAtUtc);
  const endAtUtc = new Date(input.endAtUtc);
  assertScheduleWindow(startAtUtc, endAtUtc);
  await assertActiveRequestedRoom(transaction, input.roomId);
  const attendeeUserIds = await assertActiveAttendees(
    transaction,
    actorUserId,
    input.attendeeUserIds,
  );

  const meeting = await meetingWorkflowRepository.createMeeting(transaction, actorUserId, input);
  if (!meeting) throw meetingCreateFailed();

  const revision = await meetingWorkflowRepository.createInitialRevision(
    transaction,
    actorUserId,
    meeting.meetingId,
    input,
  );
  if (!revision) throw meetingCreateFailed();

  await meetingWorkflowRepository.addAttendees(
    transaction,
    meeting.meetingId,
    actorUserId,
    attendeeUserIds,
  );

  await meetingSchedulingRepository.addActivity(
    transaction,
    meeting.meetingId,
    actorUserId,
    activityType,
    {
      revisionId: revision.revisionId,
      roomId: input.roomId,
      startAtUtc: startAtUtc.toISOString(),
      endAtUtc: endAtUtc.toISOString(),
      attendeeUserIds,
    },
  );

  return {
    meetingId: meeting.meetingId,
    revisionId: revision.revisionId,
    revisionRowVersion: revision.rowVersion,
  };
}

async function requireSummary(meetingId: number): Promise<MeetingSummary> {
  const meeting = await meetingWorkflowRepository.findSummary(meetingId);
  if (!meeting) throw meetingRequestNotFound();
  return meeting;
}

export const meetingWorkflowService = {
  async searchParticipants(input: {
    search?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<MeetingParticipantList> {
    const result = await meetingWorkflowRepository.searchParticipants(input);
    return {
      items: result.items,
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  },

  async listMyMeetings(userId: number): Promise<MeetingSummary[]> {
    return meetingWorkflowRepository.listMyMeetings(userId);
  },

  async listOrganizerRequests(userId: number): Promise<MeetingSummary[]> {
    return meetingWorkflowRepository.listOrganizerRequests(userId);
  },

  async listCoordinatorQueue(): Promise<MeetingSummary[]> {
    return meetingWorkflowRepository.listCoordinatorQueue();
  },

  async createRequest(actorUserId: number, input: CreateMeetingInput): Promise<MeetingSummary> {
    const created = await withTransaction(async (transaction) => {
      await assertEffectiveOrganizerPermission(transaction, actorUserId);
      return createPendingMeetingInTransaction(transaction, actorUserId, input, "REQUESTED");
    });

    return requireSummary(created.meetingId);
  },

  async createDirect(actorUserId: number, input: CreateMeetingInput): Promise<MeetingSummary> {
    const created = await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const pending = await createPendingMeetingInTransaction(
        transaction,
        actorUserId,
        input,
        "DIRECT_CREATED",
      );
      await meetingSchedulingService.commitPendingRevisionInTransaction(
        transaction,
        actorUserId,
        pending.meetingId,
        pending.revisionId,
        pending.revisionRowVersion,
      );
      return pending;
    });

    return requireSummary(created.meetingId);
  },

  async updateCoordinatorSchedule(
    actorUserId: number,
    meetingId: number,
    input: UpdatePendingMeetingScheduleInput,
  ): Promise<MeetingSummary> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (!current) throw meetingRequestNotFound();
      if (
        current.meetingStatus !== "PENDING_APPROVAL" ||
        current.revisionType !== "INITIAL" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw staleRequest();
      }

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertScheduleWindow(startAtUtc, endAtUtc);
      await assertActiveRequestedRoom(transaction, input.roomId);

      const updated = await meetingWorkflowRepository.updatePendingInitialSchedule(
        transaction,
        meetingId,
        input,
      );
      if (!updated) throw staleRequest();

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "SCHEDULE_CHANGED",
        {
          revisionId: input.revisionId,
          before: {
            roomId: current.roomId,
            startAtUtc: current.startAtUtc.toISOString(),
            endAtUtc: current.endAtUtc.toISOString(),
          },
          after: {
            roomId: input.roomId,
            startAtUtc: startAtUtc.toISOString(),
            endAtUtc: endAtUtc.toISOString(),
          },
          schedulingNotes: input.schedulingNotes ?? null,
        },
      );
    });

    return requireSummary(meetingId);
  },

  async approveRequest(
    actorUserId: number,
    meetingId: number,
    input: DecideMeetingRequestInput,
  ): Promise<MeetingSummary> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (!current) throw meetingRequestNotFound();
      if (
        current.meetingStatus !== "PENDING_APPROVAL" ||
        current.revisionType !== "INITIAL" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw staleRequest();
      }

      await meetingSchedulingService.commitPendingRevisionInTransaction(
        transaction,
        actorUserId,
        meetingId,
        input.revisionId,
        input.revisionRowVersion,
      );
    });

    return requireSummary(meetingId);
  },

  async rejectRequest(
    actorUserId: number,
    meetingId: number,
    input: RejectMeetingRequestInput,
  ): Promise<MeetingSummary> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (!current) throw meetingRequestNotFound();
      if (
        current.meetingStatus !== "PENDING_APPROVAL" ||
        current.revisionType !== "INITIAL" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw staleRequest();
      }

      const revisionRejected = await meetingWorkflowRepository.rejectRevision(
        transaction,
        meetingId,
        input.revisionId,
        current.revisionRowVersion,
        actorUserId,
      );
      if (!revisionRejected) throw staleRequest();

      const meetingRejected = await meetingWorkflowRepository.rejectMeeting(
        transaction,
        meetingId,
        current.meetingRowVersion,
      );
      if (!meetingRejected) throw staleRequest();

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "REJECTED",
        {
          revisionId: input.revisionId,
          reason: input.reason ?? null,
        },
      );
    });

    return requireSummary(meetingId);
  },

  async listSchedule(input: {
    userId: number;
    access: TaskHubAccess;
    fromAtUtc: string;
    toAtUtc: string;
    roomId?: number | undefined;
  }): Promise<MeetingScheduleEntry[]> {
    const fromAtUtc = new Date(input.fromAtUtc);
    const toAtUtc = new Date(input.toAtUtc);
    assertScheduleWindow(fromAtUtc, toAtUtc);

    const records = await meetingWorkflowRepository.listSchedule({
      userId: input.userId,
      fromAtUtc,
      toAtUtc,
      ...(input.roomId === undefined ? {} : { roomId: input.roomId }),
    });

    return records.flatMap((record): MeetingScheduleEntry[] => {
      const visibility = meetingScheduleVisibility(input.access, {
        isOrganizer: record.isOrganizer,
        isAttendee: record.isAttendee,
      });

      if (visibility === "NONE") return [];

      const shared = {
        organizer: record.organizer,
        room: record.room,
        startAtUtc: record.startAtUtc.toISOString(),
        endAtUtc: record.endAtUtc.toISOString(),
      };

      if (visibility === "BUSY") {
        return [
          {
            visibility: "BUSY",
            meetingId: null,
            title: null,
            ...shared,
          },
        ];
      }

      return [
        {
          visibility: "FULL",
          meetingId: record.meetingId,
          title: record.title,
          ...shared,
        },
      ];
    });
  },
};
