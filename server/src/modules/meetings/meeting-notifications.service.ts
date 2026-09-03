import { logger } from "../../config/logger.js";
import { withTransaction } from "../../database/transaction.js";
import type { NotificationType } from "../notifications/notifications.types.js";
import {
  meetingNotificationsRepository,
  type MeetingEmailState,
  type MeetingNotificationSnapshot,
} from "./meeting-notifications.repository.js";

const lifecycleEmailTypes = new Set<NotificationType>([
  "MEETING_REQUEST_SUBMITTED",
  "MEETING_REQUEST_UPDATED",
  "MEETING_APPROVED",
  "MEETING_REJECTED",
  "MEETING_INVITED",
  "MEETING_RESCHEDULED",
  "MEETING_RESCHEDULE_REQUEST_CANCELLED",
  "MEETING_CANCELLED",
]);

function dateOnly(value: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}

async function insertMany(
  recipients: readonly number[],
  snapshot: MeetingNotificationSnapshot,
  type: NotificationType,
  dedupeSuffix: string,
  contextTitle: string | null,
): Promise<void> {
  const uniqueRecipients = [...new Set(recipients)];
  await withTransaction(async (transaction) => {
    for (const ownerUserId of uniqueRecipients) {
      await meetingNotificationsRepository.insert(transaction, {
        ownerUserId,
        notificationType: type,
        dedupeKey: `${type}:${snapshot.meetingId}:${dedupeSuffix}`,
        subjectTitle: snapshot.title,
        contextTitle,
        meetingId: snapshot.meetingId,
        meetingRevisionId: snapshot.revisionId,
        eventDate: dateOnly(snapshot.startAtUtc),
        suppressEmail: type === "MEETING_START_REMINDER",
      });
    }
  });
}

async function safe(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    logger.warn({ err: error, label }, "Meeting notification delivery skipped after successful business operation");
  }
}

function isValidForType(state: MeetingEmailState, type: NotificationType): boolean {
  switch (type) {
    case "MEETING_REQUEST_SUBMITTED":
      return state.revisionStatus === "PENDING" &&
        (state.ownerIsOrganizer || state.ownerIsCoordinator) &&
        ((state.revisionType === "INITIAL" && state.meetingStatus === "PENDING_APPROVAL") ||
          (state.revisionType === "RESCHEDULE" && state.meetingStatus === "SCHEDULED"));
    case "MEETING_REQUEST_UPDATED":
      return state.revisionStatus === "PENDING" &&
        (state.ownerIsOrganizer || state.ownerIsCoordinator) &&
        ((state.revisionType === "INITIAL" && state.meetingStatus === "PENDING_APPROVAL") ||
          (state.revisionType === "RESCHEDULE" && state.meetingStatus === "SCHEDULED"));
    case "MEETING_APPROVED":
      return state.meetingStatus === "SCHEDULED" && state.currentRevisionId === state.revisionId && state.ownerIsOrganizer;
    case "MEETING_INVITED":
      return state.meetingStatus === "SCHEDULED" && state.currentRevisionId === state.revisionId && state.ownerIsAttendee;
    case "MEETING_REJECTED":
      return state.revisionStatus === "REJECTED" && state.ownerIsOrganizer;
    case "MEETING_RESCHEDULED":
      return state.meetingStatus === "SCHEDULED" && state.currentRevisionId === state.revisionId &&
        state.revisionType === "RESCHEDULE" && (state.ownerIsOrganizer || state.ownerIsAttendee);
    case "MEETING_RESCHEDULE_REQUEST_CANCELLED":
      return state.meetingStatus === "SCHEDULED" && state.revisionType === "RESCHEDULE" &&
        state.revisionStatus === "REJECTED" && (state.ownerIsOrganizer || state.ownerIsCoordinator);
    case "MEETING_CANCELLED":
      return state.meetingStatus === "CANCELLED" && (state.ownerIsOrganizer || state.ownerIsAttendee);
    default:
      return false;
  }
}

function toPayload(state: MeetingEmailState): Record<string, unknown> {
  return {
    meetingId: state.meetingId,
    revisionId: state.revisionId,
    meetingTitle: state.title,
    organizerName: state.organizerUserName,
    changedByName: state.decisionActorName,
    timeFormat: state.timeFormat,
    roomNameAr: state.roomNameAr,
    roomNameEn: state.roomNameEn,
    startAtUtc: state.startAtUtc.toISOString(),
    endAtUtc: state.endAtUtc.toISOString(),
    previousRoomNameAr: state.previousRoomNameAr,
    previousRoomNameEn: state.previousRoomNameEn,
    previousStartAtUtc: state.previousStartAtUtc?.toISOString() ?? null,
    previousEndAtUtc: state.previousEndAtUtc?.toISOString() ?? null,
    href: `/meetings/${state.meetingId}`,
  };
}

export const meetingNotificationsService = {
  safeRequestSubmitted(meetingId: number, revisionId: number): Promise<void> {
    return safe("request-submitted", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      const coordinators = await meetingNotificationsRepository.listCoordinatorUserIds();
      await insertMany(
        [snapshot.organizerUserId, ...coordinators],
        snapshot,
        "MEETING_REQUEST_SUBMITTED",
        String(revisionId),
        snapshot.organizerUserName,
      );
    });
  },

  safeRequestUpdated(meetingId: number, revisionId: number): Promise<void> {
    return safe("request-updated", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      const coordinators = await meetingNotificationsRepository.listCoordinatorUserIds();
      await insertMany(
        [snapshot.organizerUserId, ...coordinators],
        snapshot,
        "MEETING_REQUEST_UPDATED",
        `${revisionId}:${snapshot.roomId}:${snapshot.startAtUtc.getTime()}:${snapshot.endAtUtc.getTime()}`,
        snapshot.organizerUserName,
      );
    });
  },

  safeInitialScheduled(meetingId: number, revisionId: number, notifyOrganizer = true): Promise<void> {
    return safe("initial-scheduled", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      if (notifyOrganizer) {
        await insertMany([snapshot.organizerUserId], snapshot, "MEETING_APPROVED", String(revisionId), null);
      }
      const attendees = await meetingNotificationsRepository.listAttendeeUserIds(meetingId);
      await insertMany(attendees, snapshot, "MEETING_INVITED", String(revisionId), null);
      await meetingNotificationsRepository.removeStaleStartReminders(meetingId, revisionId);
    });
  },

  safeRejected(meetingId: number, revisionId: number): Promise<void> {
    return safe("request-rejected", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      await insertMany([snapshot.organizerUserId], snapshot, "MEETING_REJECTED", String(revisionId), null);
    });
  },

  safeRescheduleRequested(meetingId: number, revisionId: number): Promise<void> {
    return safe("reschedule-requested", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      const coordinators = await meetingNotificationsRepository.listCoordinatorUserIds();
      await insertMany(
        [snapshot.organizerUserId, ...coordinators],
        snapshot,
        "MEETING_REQUEST_SUBMITTED",
        String(revisionId),
        snapshot.organizerUserName,
      );
    });
  },

  safeRescheduled(meetingId: number, revisionId: number): Promise<void> {
    return safe("rescheduled", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      const participants = await meetingNotificationsRepository.listParticipantUserIds(meetingId);
      await insertMany(participants, snapshot, "MEETING_RESCHEDULED", String(revisionId), null);
      await meetingNotificationsRepository.removeStaleStartReminders(meetingId, revisionId);
    });
  },

  safeRescheduleRejected(meetingId: number, revisionId: number): Promise<void> {
    return safe("reschedule-rejected", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      await insertMany(
        [snapshot.organizerUserId],
        snapshot,
        "MEETING_REJECTED",
        String(revisionId),
        null,
      );
    });
  },

  safeRescheduleRequestCancelled(meetingId: number, revisionId: number): Promise<void> {
    return safe("reschedule-request-cancelled", async () => {
      const snapshot = await meetingNotificationsRepository.findSnapshot(meetingId, revisionId);
      if (!snapshot) return;
      const coordinators = await meetingNotificationsRepository.listCoordinatorUserIds();
      await insertMany(
        [snapshot.organizerUserId, ...coordinators],
        snapshot,
        "MEETING_RESCHEDULE_REQUEST_CANCELLED",
        String(revisionId),
        snapshot.organizerUserName,
      );
    });
  },

  safeCancelled(meetingId: number): Promise<void> {
    return safe("cancelled", async () => {
      const snapshot = await meetingNotificationsRepository.findCurrentSnapshot(meetingId);
      if (snapshot?.revisionStatus === "APPROVED") {
        const participants = await meetingNotificationsRepository.listParticipantUserIds(meetingId);
        await insertMany(participants, snapshot, "MEETING_CANCELLED", String(snapshot.revisionId), null);
      }
      await meetingNotificationsRepository.removeStaleStartReminders(meetingId, null);
    });
  },

  async syncStartReminder(ownerUserId: number): Promise<void> {
    await meetingNotificationsRepository.syncStartReminder(ownerUserId);
  },

  async buildEmailPayload(
    ownerUserId: number,
    type: NotificationType,
    meetingId: number,
    revisionId: number,
  ): Promise<Record<string, unknown> | null> {
    if (!lifecycleEmailTypes.has(type)) return null;
    const state = await meetingNotificationsRepository.getEmailState(ownerUserId, meetingId, revisionId);
    return state && isValidForType(state, type) ? toPayload(state) : null;
  },

  async validateEmailPayload(
    ownerUserId: number,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (!lifecycleEmailTypes.has(type)) return false;
    const meetingId = Number(payload.meetingId);
    const revisionId = Number(payload.revisionId);
    if (!Number.isSafeInteger(meetingId) || meetingId <= 0 || !Number.isSafeInteger(revisionId) || revisionId <= 0) {
      return false;
    }
    const state = await meetingNotificationsRepository.getEmailState(ownerUserId, meetingId, revisionId);
    return Boolean(state && isValidForType(state, type));
  },
};

