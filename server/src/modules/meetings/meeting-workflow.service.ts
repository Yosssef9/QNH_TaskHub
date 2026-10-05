import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import {
  assertParticipantCount,
  assertSchedulableMeetingWindow,
  assertScheduleWindow,
} from "./meeting-scheduling.policy.js";
import { meetingSchedulingRepository } from "./meeting-scheduling.repository.js";
import { meetingSchedulingService } from "./meeting-scheduling.service.js";
import { meetingWorkflowRepository } from "./meeting-workflow.repository.js";
import { meetingWorkspaceRepository } from "./meeting-workspace.repository.js";
import { meetingNotificationsService } from "./meeting-notifications.service.js";
import { outlookCalendarService } from "../outlook-calendar/outlook-calendar.service.js";
import type {
  CreateMeetingInput,
  MeetingAgendaItemInput,
  DecideMeetingRequestInput,
  MeetingParticipantList,
  MeetingScheduleEntry,
  MeetingSummary,
  RejectMeetingRequestInput,
  UpdatePendingMeetingScheduleInput,
} from "./meeting-workflow.types.js";
import { meetingScheduleVisibility } from "./meetings.policy.js";
import { normalizeZoomJoinUrl } from "./meeting-online-location.js";
import type { MeetingMode } from "./meetings.types.js";

type FollowUpSource = NonNullable<
  Awaited<ReturnType<typeof meetingWorkflowRepository.findFollowUpSource>>
>;

export interface PreparedMeetingCreation {
  input: CreateMeetingInput;
  startAtUtc: Date;
  endAtUtc: Date;
  selectedAttendeeUserIds: number[];
  attendeeUserIds: number[];
  agendaItems: MeetingAgendaItemInput[];
  followUpSource: FollowUpSource | null;
}

function invalidAttendee(): AppError {
  return new AppError({
    statusCode: 400,
    code: "INVALID_MEETING_ATTENDEE",
    message: "One or more selected attendees are not active Portal users.",
  });
}

function invalidAgendaPresenter(): AppError {
  return new AppError({
    statusCode: 400,
    code: "INVALID_MEETING_AGENDA_PRESENTER",
    message: "Agenda presenters must be people who are attending the Meeting.",
  });
}

function meetingCreateFailed(): AppError {
  return new AppError({
    statusCode: 500,
    code: "MEETING_CREATE_FAILED",
    message: "Meeting could not be created.",
  });
}

function followUpSourceNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_FOLLOW_UP_SOURCE_NOT_FOUND",
    message: "Follow-up source Meeting was not found or is not available for this operation.",
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

async function assertActivePortalAttendees(
  transaction: DatabaseTransaction,
  actorUserId: number,
  attendeeUserIds: readonly number[],
): Promise<number[]> {
  const normalized = normalizeAttendeeIds(actorUserId, attendeeUserIds);
  const active = await meetingWorkflowRepository.activePortalParticipantIds(transaction, normalized);
  if (active.length !== normalized.length) throw invalidAttendee();

  return normalized;
}

function normalizeAgendaItems(
  attendeeUserIds: readonly number[],
  agendaItems: readonly MeetingAgendaItemInput[],
): MeetingAgendaItemInput[] {
  const allowedPresenterIds = new Set(attendeeUserIds);

  return agendaItems.map((item) => {
    const topic = item.topic.trim();
    const presenterUserId = item.presenterUserId ?? null;
    const plannedDurationMinutes = item.plannedDurationMinutes ?? null;

    if (!topic) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_MEETING_AGENDA_TOPIC",
        message: "Every Meeting agenda item must have a topic.",
      });
    }

    if (presenterUserId !== null && !allowedPresenterIds.has(presenterUserId)) {
      throw invalidAgendaPresenter();
    }

    return {
      topic,
      presenterUserId,
      plannedDurationMinutes,
    };
  });
}

async function assertOrganizerPermissionForMode(
  transaction: DatabaseTransaction,
  actorUserId: number,
  meetingMode: MeetingMode,
): Promise<void> {
  if (meetingMode === "ZOOM") {
    const zoom = await meetingSchedulingRepository.hasActiveMeetingPermission(
      transaction,
      actorUserId,
      "MEETING_ORGANIZE_ZOOM",
    );
    if (zoom) return;
    throw new AppError({
      statusCode: 403,
      code: "ZOOM_MEETING_ORGANIZER_REQUIRED",
      message: "Zoom Meeting Organizer permission is required for this operation.",
    });
  }

  const room = await meetingSchedulingRepository.hasActiveMeetingPermission(
    transaction,
    actorUserId,
    "MEETING_ORGANIZE_ROOM",
  );
  if (room) return;
  const coordinate = await meetingSchedulingRepository.hasActiveMeetingPermission(
    transaction,
    actorUserId,
    "MEETING_COORDINATE",
  );
  if (coordinate) return;
  throw new AppError({
    statusCode: 403,
    code: "ROOM_MEETING_ORGANIZER_REQUIRED",
    message: "Room Meeting Organizer permission is required for this operation.",
  });
}

function normalizeLocationInput<T extends { meetingMode: MeetingMode; roomId: number | null; onlineJoinUrl: string | null }>(input: T): T {
  if (input.meetingMode === "ROOM") return { ...input, onlineJoinUrl: null };
  return { ...input, roomId: null, onlineJoinUrl: normalizeZoomJoinUrl(input.onlineJoinUrl) };
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

export async function prepareMeetingCreationInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  input: CreateMeetingInput,
  creationMode: "REQUEST" | "DIRECT",
): Promise<PreparedMeetingCreation> {
  const normalizedInput = normalizeLocationInput(input);
  const startAtUtc = new Date(normalizedInput.startAtUtc);
  const endAtUtc = new Date(normalizedInput.endAtUtc);
  assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
  if (normalizedInput.meetingMode === "ROOM") {
    if (normalizedInput.roomId === null) throw new AppError({ statusCode: 400, code: "MEETING_ROOM_REQUIRED", message: "Choose a Meeting Room." });
    await assertActiveRequestedRoom(transaction, normalizedInput.roomId);
  }
  const selectedAttendeeUserIds = await assertActivePortalAttendees(
    transaction,
    actorUserId,
    normalizedInput.attendeeUserIds,
  );
  const attendeeUserIds = normalizedInput.organizerAttending
    ? [actorUserId, ...selectedAttendeeUserIds]
    : selectedAttendeeUserIds;
  assertParticipantCount(attendeeUserIds.length);
  const agendaItems = normalizeAgendaItems(attendeeUserIds, normalizedInput.agendaItems);

  const followUpSource = normalizedInput.followUpOfMeetingId
    ? await meetingWorkflowRepository.findFollowUpSource(transaction, normalizedInput.followUpOfMeetingId)
    : null;
  if (normalizedInput.followUpOfMeetingId && !followUpSource) throw followUpSourceNotFound();
  if (followUpSource && creationMode === "REQUEST" && followUpSource.organizerUserId !== actorUserId) {
    throw followUpSourceNotFound();
  }

  return {
    input: normalizedInput,
    startAtUtc,
    endAtUtc,
    selectedAttendeeUserIds,
    attendeeUserIds,
    agendaItems,
    followUpSource,
  };
}

export async function createPreparedMeetingInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  prepared: PreparedMeetingCreation,
  activityType: "REQUESTED" | "DIRECT_CREATED",
  creationMode: "REQUEST" | "DIRECT",
): Promise<{ meetingId: number; revisionId: number; revisionRowVersion: string }> {
  const {
    input,
    startAtUtc,
    endAtUtc,
    selectedAttendeeUserIds,
    attendeeUserIds,
    agendaItems,
    followUpSource,
  } = prepared;

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
  await meetingWorkflowRepository.addAgendaItems(
    transaction,
    meeting.meetingId,
    actorUserId,
    agendaItems,
  );

  await meetingSchedulingRepository.addActivity(
    transaction,
    meeting.meetingId,
    actorUserId,
    activityType,
    {
      revisionId: revision.revisionId,
      meetingMode: input.meetingMode,
      roomId: input.roomId,
      startAtUtc: startAtUtc.toISOString(),
      endAtUtc: endAtUtc.toISOString(),
      organizerAttending: input.organizerAttending,
      attendeeUserIds: selectedAttendeeUserIds,
      participantCount: attendeeUserIds.length,
      agendaItemCount: agendaItems.length,
    },
  );

  if (followUpSource) {
    await meetingSchedulingRepository.addActivity(
      transaction,
      followUpSource.meetingId,
      actorUserId,
      "FOLLOW_UP_MEETING_CREATED",
      {
        followUpMeetingId: meeting.meetingId,
        followUpMeetingTitle: input.title,
        creationMode,
      },
    );
    await meetingSchedulingRepository.addActivity(
      transaction,
      meeting.meetingId,
      actorUserId,
      "CREATED_AS_FOLLOW_UP",
      {
        sourceMeetingId: followUpSource.meetingId,
        sourceMeetingTitle: followUpSource.title,
        creationMode,
      },
    );
  }

  return {
    meetingId: meeting.meetingId,
    revisionId: revision.revisionId,
    revisionRowVersion: revision.rowVersion,
  };
}

export async function createPendingMeetingInTransaction(
  transaction: DatabaseTransaction,
  actorUserId: number,
  input: CreateMeetingInput,
  activityType: "REQUESTED" | "DIRECT_CREATED",
  creationMode: "REQUEST" | "DIRECT",
): Promise<{ meetingId: number; revisionId: number; revisionRowVersion: string }> {
  const prepared = await prepareMeetingCreationInTransaction(
    transaction,
    actorUserId,
    input,
    creationMode,
  );
  return createPreparedMeetingInTransaction(
    transaction,
    actorUserId,
    prepared,
    activityType,
    creationMode,
  );
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
      await assertOrganizerPermissionForMode(transaction, actorUserId, input.meetingMode);
      const pending = await createPendingMeetingInTransaction(
        transaction,
        actorUserId,
        input,
        input.meetingMode === "ZOOM" ? "DIRECT_CREATED" : "REQUESTED",
        "REQUEST",
      );
      if (input.meetingMode === "ZOOM") {
        await meetingSchedulingService.commitZoomRevisionInTransaction(
          transaction, actorUserId, pending.meetingId, pending.revisionId, pending.revisionRowVersion,
        );
      }
      return { ...pending, meetingMode: input.meetingMode };
    });

    if (created.meetingMode === "ZOOM") {
      await meetingNotificationsService.safeInitialScheduled(created.meetingId, created.revisionId, false);
      await outlookCalendarService.safeMeetingScheduled(created.meetingId);
    } else {
      await meetingNotificationsService.safeRequestSubmitted(created.meetingId, created.revisionId);
    }
    return requireSummary(created.meetingId);
  },

  async createDirect(actorUserId: number, input: CreateMeetingInput): Promise<MeetingSummary> {
    const created = await withTransaction(async (transaction) => {
      if (input.meetingMode === "ROOM") {
        await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      } else {
        await meetingSchedulingService.assertZoomOrganizerPermission(transaction, actorUserId);
      }
      const pending = await createPendingMeetingInTransaction(
        transaction, actorUserId, input, "DIRECT_CREATED", "DIRECT",
      );
      if (input.meetingMode === "ROOM") {
        await meetingSchedulingService.commitPendingRevisionInTransaction(
          transaction, actorUserId, pending.meetingId, pending.revisionId, pending.revisionRowVersion,
        );
      } else {
        await meetingSchedulingService.commitZoomRevisionInTransaction(
          transaction, actorUserId, pending.meetingId, pending.revisionId, pending.revisionRowVersion,
        );
      }
      return pending;
    });

    await meetingNotificationsService.safeInitialScheduled(created.meetingId, created.revisionId, false);
    await outlookCalendarService.safeMeetingScheduled(created.meetingId);
    return requireSummary(created.meetingId);
  },

  async updateOrganizerPendingSchedule(
    actorUserId: number,
    meetingId: number,
    input: UpdatePendingMeetingScheduleInput,
  ): Promise<MeetingSummary> {
    const outcome = await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId, transaction);
      if (!context || context.organizerUserId !== actorUserId) throw meetingRequestNotFound();
      if (context.status !== "PENDING_APPROVAL" || context.currentRevisionId !== null || input.revisionId <= 0) throw staleRequest();
      await assertOrganizerPermissionForMode(transaction, actorUserId, input.meetingMode);

      const current = await meetingSchedulingRepository.findRevisionSchedule(transaction, meetingId, input.revisionId);
      if (!current || current.meetingStatus !== "PENDING_APPROVAL" || current.revisionType !== "INITIAL" || current.revisionStatus !== "PENDING" || current.revisionRowVersion !== input.revisionRowVersion) throw staleRequest();

      const normalized = normalizeLocationInput(input);
      const startAtUtc = new Date(normalized.startAtUtc);
      const endAtUtc = new Date(normalized.endAtUtc);
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
      if (normalized.meetingMode === "ROOM") {
        if (normalized.roomId === null) throw staleRequest();
        await assertActiveRequestedRoom(transaction, normalized.roomId);
      }

      const updated = await meetingWorkflowRepository.updatePendingInitialRequestedSchedule(transaction, meetingId, normalized);
      if (!updated) throw staleRequest();

      await meetingSchedulingRepository.addActivity(transaction, meetingId, actorUserId, "REQUEST_SCHEDULE_CHANGED", {
        revisionId: input.revisionId,
        before: { meetingMode: current.meetingMode, roomId: current.roomId, startAtUtc: current.startAtUtc.toISOString(), endAtUtc: current.endAtUtc.toISOString() },
        requested: { meetingMode: normalized.meetingMode, roomId: normalized.roomId, startAtUtc: startAtUtc.toISOString(), endAtUtc: endAtUtc.toISOString() },
      });

      if (normalized.meetingMode === "ZOOM") {
        const adjusted = await meetingSchedulingRepository.findRevisionSchedule(transaction, meetingId, input.revisionId);
        if (!adjusted) throw staleRequest();
        await meetingSchedulingService.commitZoomRevisionInTransaction(transaction, actorUserId, meetingId, input.revisionId, adjusted.revisionRowVersion);
        return "SCHEDULED" as const;
      }
      return "PENDING" as const;
    });

    if (outcome === "SCHEDULED") {
      await meetingNotificationsService.safeInitialScheduled(meetingId, input.revisionId, false);
      await outlookCalendarService.safeMeetingScheduled(meetingId);
    } else await meetingNotificationsService.safeRequestUpdated(meetingId, input.revisionId);
    return requireSummary(meetingId);
  },

  async updateCoordinatorSchedule(
    actorUserId: number,
    meetingId: number,
    input: UpdatePendingMeetingScheduleInput,
  ): Promise<MeetingSummary> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      if (input.meetingMode !== "ROOM" || input.roomId === null) {
        throw new AppError({ statusCode: 400, code: "COORDINATOR_ROOM_MEETING_REQUIRED", message: "Coordinator approval applies only to Room Meetings." });
      }
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
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
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

  async adjustAndApproveRequest(
    actorUserId: number,
    meetingId: number,
    input: UpdatePendingMeetingScheduleInput,
  ): Promise<MeetingSummary> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      if (input.meetingMode !== "ROOM" || input.roomId === null) {
        throw new AppError({ statusCode: 400, code: "COORDINATOR_ROOM_MEETING_REQUIRED", message: "Coordinator approval applies only to Room Meetings." });
      }
      const requested = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (
        !requested ||
        requested.meetingStatus !== "PENDING_APPROVAL" ||
        requested.revisionType !== "INITIAL" ||
        requested.revisionStatus !== "PENDING" ||
        requested.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw staleRequest();
      }

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
      await assertActiveRequestedRoom(transaction, input.roomId);

      const updated = await meetingWorkflowRepository.updatePendingInitialSchedule(
        transaction,
        meetingId,
        input,
      );
      if (!updated) throw staleRequest();

      const adjusted = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (!adjusted || adjusted.revisionStatus !== "PENDING") throw staleRequest();

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "SCHEDULE_CHANGED",
        {
          context: "INITIAL_ADJUST_AND_APPROVE",
          revisionId: input.revisionId,
          requested: {
            roomId: requested.roomId,
            startAtUtc: requested.startAtUtc.toISOString(),
            endAtUtc: requested.endAtUtc.toISOString(),
          },
          final: {
            roomId: input.roomId,
            startAtUtc: startAtUtc.toISOString(),
            endAtUtc: endAtUtc.toISOString(),
          },
          schedulingNotes: input.schedulingNotes ?? null,
        },
      );

      await meetingSchedulingService.commitPendingRevisionInTransaction(
        transaction,
        actorUserId,
        meetingId,
        input.revisionId,
        adjusted.revisionRowVersion,
      );
    });

    await meetingNotificationsService.safeInitialScheduled(meetingId, input.revisionId, true);
    await outlookCalendarService.safeMeetingScheduled(meetingId);
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

      if (current.meetingMode !== "ROOM") throw staleRequest();
      await meetingSchedulingService.commitPendingRevisionInTransaction(
        transaction,
        actorUserId,
        meetingId,
        input.revisionId,
        input.revisionRowVersion,
      );
    });

    await meetingNotificationsService.safeInitialScheduled(meetingId, input.revisionId, true);
    await outlookCalendarService.safeMeetingScheduled(meetingId);
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

      if (current.meetingMode !== "ROOM") throw staleRequest();
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

    await meetingNotificationsService.safeRejected(meetingId, input.revisionId);
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
      if (record.meetingMode === "ZOOM" && !record.isOrganizer && !record.isAttendee && !input.access.meetingCoordinateEnabled) return [];

      const shared = {
        organizer: record.organizer,
        meetingMode: record.meetingMode,
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

      if (visibility === "PREVIEW") {
        return [
          {
            visibility: "PREVIEW",
            meetingId: null,
            title: record.title,
            ...shared,
          },
        ];
      }

      return [
        {
          visibility: "FULL",
          meetingId: record.meetingId,
          title: record.title,
          participantCount: record.participantCount,
          agendaTopicCount: record.agendaTopicCount,
          agendaPlannedMinutes: record.agendaPlannedMinutes,
          onlineJoinUrl: record.onlineJoinUrl,
          hasPendingReschedule:
            record.hasPendingReschedule &&
            (Boolean(input.access.meetingCoordinateEnabled) || record.isOrganizer),
          ...shared,
        },
      ];
    });
  },
};





