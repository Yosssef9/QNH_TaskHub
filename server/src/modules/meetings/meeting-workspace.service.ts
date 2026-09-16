import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import {
  readMeetingAttachment,
  removeStoredMeetingAttachment,
  storeMeetingAttachment,
} from "./meeting-attachment-storage.js";
import { MAX_MEETING_ATTACHMENTS } from "./meeting-attachment-upload.middleware.js";
import { validateMeetingAttachmentFile } from "./meeting-attachment-validation.js";
import {
  canReadMeetingByRelationship,
  canReadMeetingContent,
} from "./meeting-content-access.js";
import {
  assertMeetingHasNotStarted,
  assertSchedulableMeetingWindow,
} from "./meeting-scheduling.policy.js";
import { meetingSchedulingRepository } from "./meeting-scheduling.repository.js";
import { meetingSchedulingService } from "./meeting-scheduling.service.js";
import { meetingNotificationsService } from "./meeting-notifications.service.js";
import {
  meetingWorkspaceRepository,
  mapMeetingAttachmentRecord,
} from "./meeting-workspace.repository.js";
import type {
  CancelMeetingInput,
  CancelMeetingRescheduleRequestInput,
  CoordinatorDirectRescheduleInput,
  CreateMeetingRescheduleInput,
  DecideMeetingRescheduleInput,
  MeetingActivityItem,
  MeetingAttachment,
  MeetingDetail,
  MeetingRescheduleQueueItem,
  MeetingTemplate,
  RejectMeetingRescheduleInput,
  SaveMeetingTemplateInput,
  UpdateMeetingAgendaInput,
  UpdateMeetingRescheduleInput,
  UpdateMeetingTemplateInput,
  UpdateOrganizerRescheduleInput,
} from "./meeting-workspace.types.js";
import { meetingWorkflowRepository } from "./meeting-workflow.repository.js";
import { hasMeetingPermission } from "./meetings.policy.js";

function notFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_NOT_FOUND",
    message: "Meeting was not found.",
  });
}

function stale(): AppError {
  return new AppError({
    statusCode: 409,
    code: "MEETING_WORKSPACE_STALE",
    message: "Meeting data changed after it was loaded. Reload and try again.",
  });
}

async function currentApprovedScheduleForLifecycle(
  transaction: DatabaseTransaction,
  meetingId: number,
  currentRevisionId: number | null,
) {
  if (!currentRevisionId) throw stale();

  const current = await meetingSchedulingRepository.findRevisionSchedule(
    transaction,
    meetingId,
    currentRevisionId,
  );
  if (!current || current.revisionStatus !== "APPROVED") throw stale();

  assertMeetingHasNotStarted(current.startAtUtc);
  return current;
}

function attachmentNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_ATTACHMENT_NOT_FOUND",
    message: "Meeting attachment was not found.",
  });
}

function templateNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_TEMPLATE_NOT_FOUND",
    message: "Meeting Template was not found.",
  });
}

async function assertEffectiveOrganizerPermission(
  transaction: DatabaseTransaction,
  actorUserId: number,
): Promise<void> {
  const organize = await meetingSchedulingRepository.hasActiveMeetingPermission(
    transaction,
    actorUserId,
    "MEETING_ORGANIZE",
  );

  if (organize) return;

  const coordinate = await meetingSchedulingRepository.hasActiveMeetingPermission(
    transaction,
    actorUserId,
    "MEETING_COORDINATE",
  );

  if (coordinate) return;

  throw new AppError({
    statusCode: 403,
    code: "FORBIDDEN",
    message: "Meeting Organizer permission is required for this operation.",
  });
}

async function assertActiveRoom(transaction: DatabaseTransaction, roomId: number): Promise<void> {
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

async function normalizedActivePortalAttendees(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  attendeeUserIds: readonly number[],
): Promise<number[]> {
  const normalized = [...new Set(attendeeUserIds)].filter((userId) => userId !== ownerUserId);
  const active = await meetingWorkflowRepository.activePortalParticipantIds(transaction, normalized);
  if (active.length !== normalized.length) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_ATTENDEE",
      message: "One or more selected attendees are not active Portal users.",
    });
  }
  return normalized;
}

function relatedMeetingIdFromActivity(item: MeetingActivityItem): number | null {
  if (!item.changes) return null;

  const raw =
    item.activityType === "FOLLOW_UP_MEETING_CREATED"
      ? item.changes.followUpMeetingId
      : item.activityType === "CREATED_AS_FOLLOW_UP"
        ? item.changes.sourceMeetingId
        : null;

  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0) return null;
  return raw;
}

async function filterRelationshipActivity(
  actorUserId: number,
  access: TaskHubAccess,
  meetingId: number,
  activity: MeetingActivityItem[],
): Promise<MeetingActivityItem[]> {
  const relationshipActivity = activity.filter(
    (item) =>
      item.activityType === "FOLLOW_UP_MEETING_CREATED" ||
      item.activityType === "CREATED_AS_FOLLOW_UP",
  );
  if (relationshipActivity.length === 0) return activity;

  const family = await meetingWorkflowRepository.listRelatedMeetingFamily(meetingId, actorUserId);
  const visibleMeetingIds = new Set(
    family.items
      .filter(({ meeting, isAttendee }) =>
        canReadMeetingByRelationship(
          {
            organizerUserId: meeting.organizer.userId,
            status: meeting.status,
            isAttendee,
          },
          actorUserId,
          access,
        ),
      )
      .map(({ meeting }) => meeting.id),
  );

  return activity.filter((item) => {
    if (
      item.activityType !== "FOLLOW_UP_MEETING_CREATED" &&
      item.activityType !== "CREATED_AS_FOLLOW_UP"
    ) {
      return true;
    }

    const relatedMeetingId = relatedMeetingIdFromActivity(item);
    return relatedMeetingId !== null && visibleMeetingIds.has(relatedMeetingId);
  });
}

async function loadDetail(
  actorUserId: number,
  access: TaskHubAccess,
  meetingId: number,
): Promise<MeetingDetail> {
  const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId);
  if (!context) throw notFound();

  const isOrganizer = context.organizerUserId === actorUserId;
  const coordinatorCanRead = hasMeetingPermission(access, "MEETING_COORDINATE");

  if (!canReadMeetingContent(context, actorUserId, access)) throw notFound();

  const [meeting, agendaItems, revisions, rawActivity] = await Promise.all([
    meetingWorkflowRepository.findSummary(meetingId),
    meetingWorkspaceRepository.listAgendaItems(meetingId),
    meetingWorkspaceRepository.listRevisions(meetingId),
    meetingWorkspaceRepository.listActivity(meetingId),
  ]);
  if (!meeting) throw notFound();

  const activity = await filterRelationshipActivity(actorUserId, access, meetingId, rawActivity);
  const scheduledMeetingHasStarted =
    context.status === "SCHEDULED" && new Date(meeting.startAtUtc).getTime() <= Date.now();

  const pendingReschedule =
    revisions.find(
      (revision) => revision.revisionType === "RESCHEDULE" && revision.revisionStatus === "PENDING",
    ) ?? null;

  return {
    meeting,
    agendaItems,
    revisions,
    activity,
    pendingReschedule,
    permissions: {
      canCancel:
        isOrganizer &&
        (context.status === "PENDING_APPROVAL" ||
          (context.status === "SCHEDULED" && !scheduledMeetingHasStarted)),
      canReschedule:
        isOrganizer &&
        context.status === "SCHEDULED" &&
        !scheduledMeetingHasStarted &&
        !context.hasPendingReschedule,
      canEditPendingSchedule: isOrganizer && context.status === "PENDING_APPROVAL",
      canEditPendingReschedule:
        isOrganizer &&
        context.status === "SCHEDULED" &&
        !scheduledMeetingHasStarted &&
        context.hasPendingReschedule,
      canCancelPendingReschedule:
        isOrganizer && context.status === "SCHEDULED" && context.hasPendingReschedule,
      canDecidePendingRequest: coordinatorCanRead && context.status === "PENDING_APPROVAL",
      canCoordinatorReschedule:
        coordinatorCanRead && context.status === "SCHEDULED" && !scheduledMeetingHasStarted,
      canDecidePendingReschedule:
        coordinatorCanRead && context.status === "SCHEDULED" && context.hasPendingReschedule,
      canManageAgenda:
        isOrganizer && ["PENDING_APPROVAL", "SCHEDULED"].includes(context.status),
      canManageAttachments:
        isOrganizer && ["PENDING_APPROVAL", "SCHEDULED"].includes(context.status),
      canSaveAsTemplate: isOrganizer && hasMeetingPermission(access, "MEETING_ORGANIZE"),
    },
  };
}

async function assertAttachmentReadAccess(
  actorUserId: number,
  access: TaskHubAccess,
  meetingId: number,
): Promise<void> {
  const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId);
  if (!context || !canReadMeetingContent(context, actorUserId, access)) {
    throw attachmentNotFound();
  }
}

async function assertAttachmentWriteAccess(
  transaction: DatabaseTransaction,
  actorUserId: number,
  meetingId: number,
): Promise<void> {
  const context = await meetingWorkspaceRepository.findAccessContext(
    meetingId,
    actorUserId,
    transaction,
  );
  if (!context || context.organizerUserId !== actorUserId) throw attachmentNotFound();
  if (!["PENDING_APPROVAL", "SCHEDULED"].includes(context.status)) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_ATTACHMENTS_READ_ONLY",
      message: "Files are read-only after a Meeting is rejected or cancelled.",
    });
  }
}

async function validateTemplateInput(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  input: SaveMeetingTemplateInput,
  excludeTemplateId?: number,
): Promise<number[]> {
  await assertEffectiveOrganizerPermission(transaction, ownerUserId);
  if (input.defaultRoomId) await assertActiveRoom(transaction, input.defaultRoomId);
  const selectedAttendeeUserIds = await normalizedActivePortalAttendees(
    transaction,
    ownerUserId,
    input.attendeeUserIds,
  );
  const attendeeUserIds = input.organizerAttending
    ? [ownerUserId, ...selectedAttendeeUserIds]
    : selectedAttendeeUserIds;
  if (
    await meetingWorkspaceRepository.activeTemplateNameExists(
      transaction,
      ownerUserId,
      input.name,
      excludeTemplateId,
    )
  ) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_TEMPLATE_NAME_EXISTS",
      message: "An active Meeting Template already uses this name.",
    });
  }
  return attendeeUserIds;
}

async function listPendingReschedulesInternal(): Promise<MeetingRescheduleQueueItem[]> {
  const meetingIds = await meetingWorkspaceRepository.listPendingRescheduleMeetingIds();
  const items = await Promise.all(
    meetingIds.map(async (meetingId): Promise<MeetingRescheduleQueueItem | null> => {
      const [meeting, revisions] = await Promise.all([
        meetingWorkflowRepository.findSummary(meetingId),
        meetingWorkspaceRepository.listRevisions(meetingId),
      ]);
      if (!meeting) return null;
      const requestedRevision = revisions.find(
        (revision) =>
          revision.revisionType === "RESCHEDULE" && revision.revisionStatus === "PENDING",
      );
      return requestedRevision ? { meeting, requestedRevision } : null;
    }),
  );
  return items.filter((item): item is MeetingRescheduleQueueItem => item !== null);
}

export const meetingWorkspaceService = {
  getDetail: loadDetail,

  async updateAgenda(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: UpdateMeetingAgendaInput,
  ): Promise<MeetingDetail> {
    await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.organizerUserId !== actorUserId) throw notFound();
      if (!["PENDING_APPROVAL", "SCHEDULED"].includes(context.status)) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_AGENDA_READ_ONLY",
          message: "Agenda topics are read-only after a Meeting is rejected or cancelled.",
        });
      }
      if (context.meetingRowVersion !== input.meetingRowVersion) throw stale();

      const attendeeUserIds = await meetingWorkspaceRepository.listMeetingAttendeeIds(
        transaction,
        meetingId,
      );
      const allowedPresenterIds = new Set(attendeeUserIds);
      const agendaItems = input.agendaItems.map((item) => {
        const topic = item.topic.trim();
        if (!topic) {
          throw new AppError({
            statusCode: 400,
            code: "INVALID_MEETING_AGENDA_TOPIC",
            message: "Every agenda item must include a topic.",
          });
        }
        const presenterUserId = item.presenterUserId ?? null;
        if (presenterUserId !== null && !allowedPresenterIds.has(presenterUserId)) {
          throw new AppError({
            statusCode: 400,
            code: "INVALID_MEETING_AGENDA_PRESENTER",
            message: "Agenda presenters must be people who are attending the Meeting.",
          });
        }
        return {
          id: item.id ?? null,
          topic,
          presenterUserId,
          plannedDurationMinutes: item.plannedDurationMinutes ?? null,
        };
      });

      const replaceResult = await meetingWorkspaceRepository.replaceAgendaItems(transaction, {
        meetingId,
        actorUserId,
        expectedMeetingRowVersion: input.meetingRowVersion,
        agendaItems,
      });
      if (replaceResult === "STALE") throw stale();
      if (replaceResult === "INVALID_ITEM") {
        throw new AppError({
          statusCode: 400,
          code: "INVALID_MEETING_AGENDA_ITEM",
          message: "One or more Agenda topics no longer belong to this Meeting.",
        });
      }

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "AGENDA_UPDATED",
        { topicCount: agendaItems.length },
      );
    });

    return loadDetail(actorUserId, access, meetingId);
  },

  async requestReschedule(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: CreateMeetingRescheduleInput,
  ): Promise<MeetingDetail> {
    const createdRevisionId = await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.organizerUserId !== actorUserId) throw notFound();
      if (context.status !== "SCHEDULED" || context.meetingRowVersion !== input.meetingRowVersion) {
        throw stale();
      }
      if (
        await meetingWorkspaceRepository.pendingRescheduleExistsForUpdate(transaction, meetingId)
      ) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_RESCHEDULE_ALREADY_PENDING",
          message: "This Meeting already has a pending reschedule request.",
        });
      }

      const currentRevision = await currentApprovedScheduleForLifecycle(
        transaction,
        meetingId,
        context.currentRevisionId,
      );

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
      await assertActiveRoom(transaction, input.roomId);

      const created = await meetingWorkspaceRepository.createRescheduleRevision(
        transaction,
        meetingId,
        actorUserId,
        { roomId: input.roomId, startAtUtc, endAtUtc },
      );
      if (!created) {
        throw new AppError({
          statusCode: 500,
          code: "MEETING_RESCHEDULE_CREATE_FAILED",
          message: "Meeting reschedule request could not be created.",
        });
      }

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "RESCHEDULE_REQUESTED",
        {
          revisionId: created.revisionId,
          before: {
            roomId: currentRevision.roomId,
            startAtUtc: currentRevision.startAtUtc.toISOString(),
            endAtUtc: currentRevision.endAtUtc.toISOString(),
          },
          requested: {
            roomId: input.roomId,
            startAtUtc: startAtUtc.toISOString(),
            endAtUtc: endAtUtc.toISOString(),
          },
        },
      );
      return created.revisionId;
    });
    await meetingNotificationsService.safeRescheduleRequested(meetingId, createdRevisionId);
    return loadDetail(actorUserId, access, meetingId);
  },

  async updateOrganizerReschedule(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: UpdateOrganizerRescheduleInput,
  ): Promise<MeetingDetail> {
    await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.organizerUserId !== actorUserId) throw notFound();
      if (context.status !== "SCHEDULED") throw stale();
      await currentApprovedScheduleForLifecycle(
        transaction,
        meetingId,
        context.currentRevisionId,
      );

      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (
        !current ||
        current.revisionType !== "RESCHEDULE" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw stale();
      }

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
      await assertActiveRoom(transaction, input.roomId);

      if (
        !(await meetingWorkspaceRepository.updatePendingRescheduleRequestedSchedule(
          transaction,
          meetingId,
          input,
        ))
      ) {
        throw stale();
      }

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "RESCHEDULE_REQUEST_UPDATED",
        {
          revisionId: input.revisionId,
          before: {
            roomId: current.roomId,
            startAtUtc: current.startAtUtc.toISOString(),
            endAtUtc: current.endAtUtc.toISOString(),
          },
          requested: {
            roomId: input.roomId,
            startAtUtc: startAtUtc.toISOString(),
            endAtUtc: endAtUtc.toISOString(),
          },
        },
      );
    });

    await meetingNotificationsService.safeRequestUpdated(meetingId, input.revisionId);
    return loadDetail(actorUserId, access, meetingId);
  },

  async cancelOrganizerRescheduleRequest(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: CancelMeetingRescheduleRequestInput,
  ): Promise<MeetingDetail> {
    await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.organizerUserId !== actorUserId) throw notFound();
      if (context.status !== "SCHEDULED") throw stale();

      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (
        !current ||
        current.revisionType !== "RESCHEDULE" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw stale();
      }

      if (
        !(await meetingWorkspaceRepository.rejectPendingReschedule(
          transaction,
          meetingId,
          input.revisionId,
          input.revisionRowVersion,
          actorUserId,
        ))
      ) {
        throw stale();
      }

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "RESCHEDULE_REQUEST_CANCELLED",
        {
          revisionId: input.revisionId,
          reason: input.reason ?? null,
          requested: {
            roomId: current.roomId,
            startAtUtc: current.startAtUtc.toISOString(),
            endAtUtc: current.endAtUtc.toISOString(),
          },
        },
      );
    });

    await meetingNotificationsService.safeRescheduleRequestCancelled(meetingId, input.revisionId);
    return loadDetail(actorUserId, access, meetingId);
  },

  async listPendingReschedules(): Promise<MeetingRescheduleQueueItem[]> {
    return listPendingReschedulesInternal();
  },

  async updateCoordinatorReschedule(
    actorUserId: number,
    meetingId: number,
    input: UpdateMeetingRescheduleInput,
  ): Promise<MeetingRescheduleQueueItem> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.status !== "SCHEDULED") throw notFound();
      await currentApprovedScheduleForLifecycle(
        transaction,
        meetingId,
        context.currentRevisionId,
      );

      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (
        !current ||
        current.meetingStatus !== "SCHEDULED" ||
        current.revisionType !== "RESCHEDULE" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw stale();
      }

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
      await assertActiveRoom(transaction, input.roomId);
      if (
        !(await meetingWorkspaceRepository.updatePendingRescheduleSchedule(
          transaction,
          meetingId,
          input,
        ))
      ) {
        throw stale();
      }
      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "SCHEDULE_CHANGED",
        {
          context: "RESCHEDULE",
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
    const item = (await listPendingReschedulesInternal()).find(
      (value) => value.meeting.id === meetingId,
    );
    if (!item) throw notFound();
    return item;
  },

  async adjustAndApproveReschedule(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: UpdateMeetingRescheduleInput,
  ): Promise<MeetingDetail> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.status !== "SCHEDULED") throw notFound();
      await currentApprovedScheduleForLifecycle(
        transaction,
        meetingId,
        context.currentRevisionId,
      );

      const requested = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (
        !requested ||
        requested.meetingStatus !== "SCHEDULED" ||
        requested.revisionType !== "RESCHEDULE" ||
        requested.revisionStatus !== "PENDING" ||
        requested.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw stale();
      }

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
      await assertActiveRoom(transaction, input.roomId);

      if (
        !(await meetingWorkspaceRepository.updatePendingRescheduleSchedule(
          transaction,
          meetingId,
          input,
        ))
      ) {
        throw stale();
      }

      const adjusted = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (!adjusted || adjusted.revisionStatus !== "PENDING") throw stale();

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "SCHEDULE_CHANGED",
        {
          context: "RESCHEDULE_ADJUST_AND_APPROVE",
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

    await meetingNotificationsService.safeRescheduled(meetingId, input.revisionId);
    return loadDetail(actorUserId, access, meetingId);
  },

  async coordinatorDirectReschedule(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: CoordinatorDirectRescheduleInput,
  ): Promise<MeetingDetail> {
    const revisionId = await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.status !== "SCHEDULED") throw notFound();
      if (context.meetingRowVersion !== input.meetingRowVersion) throw stale();
      if (context.hasPendingReschedule) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_RESCHEDULE_ALREADY_PENDING",
          message: "This Meeting already has a pending reschedule request. Review that request instead.",
        });
      }
      const current = await currentApprovedScheduleForLifecycle(
        transaction,
        meetingId,
        context.currentRevisionId,
      );

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertSchedulableMeetingWindow(startAtUtc, endAtUtc);
      await assertActiveRoom(transaction, input.roomId);

      const created = await meetingWorkspaceRepository.createRescheduleRevision(
        transaction,
        meetingId,
        actorUserId,
        {
          roomId: input.roomId,
          startAtUtc,
          endAtUtc,
          schedulingNotes: input.schedulingNotes ?? null,
        },
      );
      if (!created) {
        throw new AppError({
          statusCode: 500,
          code: "MEETING_RESCHEDULE_CREATE_FAILED",
          message: "Meeting reschedule could not be created.",
        });
      }

      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "SCHEDULE_CHANGED",
        {
          context: "COORDINATOR_DIRECT_RESCHEDULE",
          revisionId: created.revisionId,
          before: {
            roomId: current.roomId,
            startAtUtc: current.startAtUtc.toISOString(),
            endAtUtc: current.endAtUtc.toISOString(),
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
        created.revisionId,
        created.rowVersion,
      );
      return created.revisionId;
    });

    await meetingNotificationsService.safeRescheduled(meetingId, revisionId);
    return loadDetail(actorUserId, access, meetingId);
  },

  async approveReschedule(
    actorUserId: number,
    meetingId: number,
    input: DecideMeetingRescheduleInput,
  ): Promise<void> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.status !== "SCHEDULED") throw notFound();
      await currentApprovedScheduleForLifecycle(
        transaction,
        meetingId,
        context.currentRevisionId,
      );

      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (
        !current ||
        current.meetingStatus !== "SCHEDULED" ||
        current.revisionType !== "RESCHEDULE" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw stale();
      }
      await meetingSchedulingService.commitPendingRevisionInTransaction(
        transaction,
        actorUserId,
        meetingId,
        input.revisionId,
        input.revisionRowVersion,
      );
    });
    await meetingNotificationsService.safeRescheduled(meetingId, input.revisionId);
  },

  async rejectReschedule(
    actorUserId: number,
    meetingId: number,
    input: RejectMeetingRescheduleInput,
  ): Promise<void> {
    await withTransaction(async (transaction) => {
      await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
      const current = await meetingSchedulingRepository.findRevisionSchedule(
        transaction,
        meetingId,
        input.revisionId,
      );
      if (
        !current ||
        current.meetingStatus !== "SCHEDULED" ||
        current.revisionType !== "RESCHEDULE" ||
        current.revisionStatus !== "PENDING" ||
        current.revisionRowVersion !== input.revisionRowVersion
      ) {
        throw stale();
      }
      if (
        !(await meetingWorkspaceRepository.rejectPendingReschedule(
          transaction,
          meetingId,
          input.revisionId,
          input.revisionRowVersion,
          actorUserId,
        ))
      ) {
        throw stale();
      }
      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "RESCHEDULE_REJECTED",
        { revisionId: input.revisionId, reason: input.reason ?? null },
      );
    });
    await meetingNotificationsService.safeRescheduleRejected(meetingId, input.revisionId);
  },

  async cancelMeeting(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: CancelMeetingInput,
  ): Promise<MeetingDetail> {
    await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.organizerUserId !== actorUserId) throw notFound();
      if (
        !["PENDING_APPROVAL", "SCHEDULED"].includes(context.status) ||
        context.meetingRowVersion !== input.meetingRowVersion
      ) {
        throw stale();
      }
      if (context.status === "SCHEDULED") {
        await currentApprovedScheduleForLifecycle(
          transaction,
          meetingId,
          context.currentRevisionId,
        );
      }
      await meetingWorkspaceRepository.rejectPendingRevisionsOnCancellation(
        transaction,
        meetingId,
        actorUserId,
      );
      if (!(await meetingWorkspaceRepository.cancelMeeting(transaction, meetingId, input))) {
        throw stale();
      }
      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "CANCELLED",
        { reason: input.reason ?? null },
      );
    });
    await meetingNotificationsService.safeCancelled(meetingId);
    return loadDetail(actorUserId, access, meetingId);
  },

  async listAttachments(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
  ): Promise<MeetingAttachment[]> {
    await assertAttachmentReadAccess(actorUserId, access, meetingId);
    return meetingWorkspaceRepository.listAttachments(meetingId);
  },

  async uploadAttachment(
    actorUserId: number,
    meetingId: number,
    file: Express.Multer.File,
  ): Promise<MeetingAttachment> {
    const { originalFileName, extension, mimeType } = validateMeetingAttachmentFile(file);

    const storageKey = await storeMeetingAttachment(file.buffer, extension);
    try {
      const attachmentId = await withTransaction(async (transaction) => {
        await assertAttachmentWriteAccess(transaction, actorUserId, meetingId);
        const count = await meetingWorkspaceRepository.countActiveAttachments(
          transaction,
          meetingId,
        );
        if (count >= MAX_MEETING_ATTACHMENTS) {
          throw new AppError({
            statusCode: 409,
            code: "MEETING_ATTACHMENT_LIMIT_REACHED",
            message: "A Meeting can have at most 10 active attachments.",
          });
        }
        const created = await meetingWorkspaceRepository.createAttachment(transaction, {
          meetingId,
          actorUserId,
          originalFileName,
          storageKey,
          mimeType,
          fileExtension: extension,
          sizeBytes: file.size,
        });
        if (!created) {
          throw new AppError({
            statusCode: 500,
            code: "MEETING_ATTACHMENT_CREATE_FAILED",
            message: "Meeting attachment metadata could not be saved.",
          });
        }
        await meetingSchedulingRepository.addActivity(
          transaction,
          meetingId,
          actorUserId,
          "ATTACHMENT_ADDED",
          { attachmentId: created.id, fileName: originalFileName, sizeBytes: file.size },
        );
        return created.id;
      });
      const created = await meetingWorkspaceRepository.findAttachment(attachmentId);
      if (!created) throw attachmentNotFound();
      return mapMeetingAttachmentRecord(created);
    } catch (error) {
      await removeStoredMeetingAttachment(storageKey);
      throw error;
    }
  },

  async readAttachment(actorUserId: number, access: TaskHubAccess, attachmentId: string) {
    const attachment = await meetingWorkspaceRepository.findAttachment(attachmentId);
    if (!attachment) throw attachmentNotFound();
    await assertAttachmentReadAccess(actorUserId, access, Number(attachment.meetingId));
    return {
      attachment: mapMeetingAttachmentRecord(attachment),
      buffer: await readMeetingAttachment(attachment.storageKey),
    };
  },

  async removeAttachment(actorUserId: number, attachmentId: string): Promise<void> {
    const removed = await withTransaction(async (transaction) => {
      const attachment = await meetingWorkspaceRepository.findAttachment(attachmentId, transaction);
      if (!attachment) throw attachmentNotFound();
      const meetingId = Number(attachment.meetingId);
      await assertAttachmentWriteAccess(transaction, actorUserId, meetingId);
      if (!(await meetingWorkspaceRepository.deactivateAttachment(transaction, attachmentId))) {
        throw attachmentNotFound();
      }
      await meetingSchedulingRepository.addActivity(
        transaction,
        meetingId,
        actorUserId,
        "ATTACHMENT_REMOVED",
        {
          attachmentId,
          fileName: attachment.originalFileName,
          sizeBytes: Number(attachment.sizeBytes),
        },
      );
      const remainingReferences = await meetingWorkspaceRepository.countActiveStorageKeyReferences(
        transaction,
        attachment.storageKey,
      );
      return { attachment, shouldDeleteStoredFile: remainingReferences === 0 };
    });
    if (removed.shouldDeleteStoredFile) {
      await removeStoredMeetingAttachment(removed.attachment.storageKey);
    }
  },

  async listTemplates(ownerUserId: number): Promise<MeetingTemplate[]> {
    return meetingWorkspaceRepository.listTemplates(ownerUserId);
  },

  async createTemplate(
    ownerUserId: number,
    input: SaveMeetingTemplateInput,
  ): Promise<MeetingTemplate> {
    const templateId = await withTransaction(async (transaction) => {
      const attendeeUserIds = await validateTemplateInput(transaction, ownerUserId, input);
      const id = await meetingWorkspaceRepository.createTemplate(transaction, ownerUserId, input);
      if (!id) {
        throw new AppError({
          statusCode: 500,
          code: "MEETING_TEMPLATE_CREATE_FAILED",
          message: "Meeting Template could not be created.",
        });
      }
      await meetingWorkspaceRepository.replaceTemplateAttendees(
        transaction,
        ownerUserId,
        id,
        attendeeUserIds,
      );
      return id;
    });
    const template = await meetingWorkspaceRepository.findTemplate(ownerUserId, templateId);
    if (!template) throw templateNotFound();
    return template;
  },

  async updateTemplate(
    ownerUserId: number,
    templateId: number,
    input: UpdateMeetingTemplateInput,
  ): Promise<MeetingTemplate> {
    await withTransaction(async (transaction) => {
      await assertEffectiveOrganizerPermission(transaction, ownerUserId);
      const current = await meetingWorkspaceRepository.findTemplate(
        ownerUserId,
        templateId,
        transaction,
      );
      if (!current || current.rowVersion !== input.rowVersion) throw stale();
      const attendeeUserIds = await validateTemplateInput(
        transaction,
        ownerUserId,
        input,
        templateId,
      );
      if (
        !(await meetingWorkspaceRepository.updateTemplate(
          transaction,
          ownerUserId,
          templateId,
          input,
        ))
      ) {
        throw stale();
      }
      await meetingWorkspaceRepository.replaceTemplateAttendees(
        transaction,
        ownerUserId,
        templateId,
        attendeeUserIds,
      );
    });
    const template = await meetingWorkspaceRepository.findTemplate(ownerUserId, templateId);
    if (!template) throw templateNotFound();
    return template;
  },

  async archiveTemplate(
    ownerUserId: number,
    templateId: number,
    rowVersion: string,
  ): Promise<void> {
    await withTransaction(async (transaction) => {
      await assertEffectiveOrganizerPermission(transaction, ownerUserId);
      const current = await meetingWorkspaceRepository.findTemplate(
        ownerUserId,
        templateId,
        transaction,
      );
      if (!current || current.rowVersion !== rowVersion) throw stale();
      if (
        !(await meetingWorkspaceRepository.archiveTemplate(
          transaction,
          ownerUserId,
          templateId,
          rowVersion,
        ))
      ) {
        throw stale();
      }
    });
  },
};




