import { withTransaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import { meetingSchedulingRepository } from "./meeting-scheduling.repository.js";
import { assertParticipantCount } from "./meeting-scheduling.policy.js";
import { classifyDirectMeetingWindow } from "./meeting-historical.policy.js";
import { meetingWorkspaceRepository } from "./meeting-workspace.repository.js";
import { meetingWorkflowRepository } from "./meeting-workflow.repository.js";
import { historicalMeetingEditRepository as repository } from "./meeting-historical-edit.repository.js";
import { meetingWorkspaceService } from "./meeting-workspace.service.js";
import type { UpdateHistoricalMeetingInput } from "./meeting-historical-edit.schemas.js";

function conflict(code: string, message: string, details?: Record<string, unknown>): AppError {
  return new AppError({ statusCode: 409, code, message, details });
}

/** Historical updates never enter normal schedule/approval/Outlook notification workflows. */
export const historicalMeetingEditService = {
  async dependencies(actorUserId: number, meetingId: number) {
    return withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId, transaction);
      if (!context || context.organizerUserId !== actorUserId || context.status !== "SCHEDULED") {
        throw new AppError({ statusCode: 404, code: "MEETING_NOT_FOUND", message: "Meeting not found." });
      }
      // Dependency inspection also serves ordinary scheduled Meetings: the same
      // Action Item/Decision foreign-key policy protects their Agenda edits.
      const participantReasons: Array<{ userId: number; reasons: string[] }> = [];
      for (const id of await repository.listAttendeesForUpdate(transaction, meetingId)) {
        const reasons = await repository.participantDependencies(transaction, meetingId, id);
        if (reasons.length) participantReasons.push({ userId: id, reasons });
      }
      const agenda = await repository.linkedAgendaDetails(transaction, meetingId);
      return { participants: participantReasons, agendaIds: agenda.map((item) => item.id), agenda };
    });
  },

  async update(actorUserId: number, access: TaskHubAccess, meetingId: number, input: UpdateHistoricalMeetingInput) {
    const startAtUtc = new Date(input.startAtUtc);
    const endAtUtc = new Date(input.endAtUtc);
    if (!classifyDirectMeetingWindow(startAtUtc, endAtUtc)) {
      throw conflict("HISTORICAL_MEETING_MUST_BE_PAST", "Historical Meeting end time must already have passed.");
    }

    await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId, transaction);
      if (!context || context.organizerUserId !== actorUserId) {
        throw new AppError({ statusCode: 404, code: "MEETING_NOT_FOUND", message: "Meeting not found." });
      }
      if (context.status !== "SCHEDULED" || !context.currentRevisionId) {
        throw conflict("HISTORICAL_MEETING_READ_ONLY", "Only scheduled historical Meetings can be edited.");
      }
      const previous = await meetingSchedulingRepository.findRevisionSchedule(transaction, meetingId, context.currentRevisionId);
      if (!previous || !previous.isHistoricalEntry || previous.revisionStatus !== "APPROVED") {
        throw conflict("HISTORICAL_MEETING_READ_ONLY", "This Meeting is not an editable historical entry.");
      }
      if (context.meetingRowVersion !== input.meetingRowVersion || previous.revisionRowVersion !== input.revisionRowVersion) {
        throw conflict("MEETING_WORKSPACE_STALE", "Meeting data changed; reload before editing.");
      }
      const title = input.title.trim();
      if (!title) throw conflict("INVALID_MEETING_TITLE", "A Meeting title is required.");
      const selected = [...new Set(input.attendeeUserIds)].filter((id) => id !== actorUserId);
      const newMemberIds = input.organizerAttending ? [actorUserId, ...selected] : selected;
      assertParticipantCount(newMemberIds.length);
      if ((await meetingWorkflowRepository.activePortalParticipantIds(transaction, selected)).length !== selected.length) {
        throw conflict("INVALID_MEETING_ATTENDEE", "An attendee is no longer active in the Portal.");
      }
      if (input.meetingMode === "ROOM" && input.roomId === null) {
        throw conflict("MEETING_ROOM_REQUIRED", "Choose a Meeting Room.");
      }

      // The parent row update holds an exclusive lock until commit and enforces optimistic concurrency.
      const claimed = await repository.updateIdentity(transaction, {
        meetingId, actorUserId, expectedRowVersion: input.meetingRowVersion,
        expectedRevisionId: previous.revisionId, title, description: input.description ?? null,
      });
      if (!claimed) throw conflict("MEETING_WORKSPACE_STALE", "Meeting data changed; reload before editing.");

      const oldMemberIds = await repository.listAttendeesForUpdate(transaction, meetingId);
      const removed = oldMemberIds.filter((id) => !newMemberIds.includes(id));
      for (const userId of removed) {
        const dependencies = await repository.participantDependencies(transaction, meetingId, userId);
        if (dependencies.length) {
          throw conflict("HISTORICAL_PARTICIPANT_HAS_DEPENDENCIES",
            "A participant has linked tasks, attendance, agenda, files, decisions or other work and cannot be removed.",
            { participantUserId: userId, dependencies });
        }
      }
      for (const userId of newMemberIds.filter((id) => !oldMemberIds.includes(id))) {
        await repository.addAttendee(transaction, meetingId, actorUserId, userId);
      }

      // Snapshot existing content while holding child locks for an immutable, readable audit.
      const previousAgenda = await repository.agendaSnapshot(transaction, meetingId);
      // Preserve agenda IDs, rejecting deletion when other records reference them.
      const allowedPresenterIds = new Set(newMemberIds);
      const agendaItems = input.agendaItems.map((item) => {
        if (item.presenterUserId !== null && !allowedPresenterIds.has(item.presenterUserId)) {
          throw conflict("INVALID_MEETING_AGENDA_PRESENTER", "An agenda presenter must remain a participant.");
        }
        return item;
      });
      const agendaResult = await meetingWorkspaceRepository.replaceAgendaItems(transaction, {
        meetingId, actorUserId, expectedMeetingRowVersion: claimed.rowVersion, agendaItems,
      });
      if (agendaResult !== "UPDATED") throw conflict("MEETING_WORKSPACE_STALE", "Agenda data changed; reload before editing.");
      for (const userId of removed) {
        await repository.removeAttendee(transaction, meetingId, userId);
      }

      const scheduleChanged = previous.meetingMode !== input.meetingMode || previous.roomId !== input.roomId ||
        (previous.onlineJoinUrl ?? null) !== (input.onlineJoinUrl ?? null) ||
        previous.startAtUtc.getTime() !== startAtUtc.getTime() || previous.endAtUtc.getTime() !== endAtUtc.getTime();
      if (input.meetingMode === "ROOM" && input.roomId !== null) {
        if (scheduleChanged) {
          const room = await meetingSchedulingRepository.findRoomForScheduling(transaction, input.roomId);
          if (!room || !room.isActive) throw conflict("ACTIVE_MEETING_ROOM_REQUIRED", "Choose an active Meeting Room.");
          const lockResult = await meetingSchedulingRepository.acquireRoomLock(transaction, input.roomId);
          if (lockResult < 0) throw conflict("MEETING_ROOM_SCHEDULE_BUSY", "Meeting Room is currently being scheduled.");
          const conflicting = await meetingSchedulingRepository.countConflictsInTransaction(
            transaction, input.roomId, startAtUtc, endAtUtc, meetingId,
          );
          if (conflicting > 0) throw conflict("MEETING_ROOM_TIME_CONFLICT", "Meeting Room is already occupied during that time.");
        }
        if (scheduleChanged || oldMemberIds.length !== newMemberIds.length) {
          const room = await meetingSchedulingRepository.findRoomForScheduling(transaction, input.roomId);
          if (!room || Number(room.capacity) < newMemberIds.length) {
            throw conflict("MEETING_ROOM_CAPACITY_EXCEEDED", "Meeting Room capacity is lower than the participant count.");
          }
        }
      }

      if (scheduleChanged) {
        const revisionId = await repository.createApprovedRevision(transaction, {
          meetingId, actorUserId, meetingMode: input.meetingMode,
          roomId: input.roomId, onlineJoinUrl: input.onlineJoinUrl, startAtUtc, endAtUtc,
        });
        await repository.activateHistoricalRevision(transaction, meetingId, revisionId);
      }
      await meetingSchedulingRepository.addActivity(transaction, meetingId, actorUserId, "HISTORICAL_MEETING_EDITED", {
        previousRevisionId: previous.revisionId,
        scheduleChanged,
        oldSchedule: { meetingMode: previous.meetingMode, roomId: previous.roomId,
          startAtUtc: previous.startAtUtc.toISOString(), endAtUtc: previous.endAtUtc.toISOString() },
        newSchedule: { meetingMode: input.meetingMode, roomId: input.roomId,
          startAtUtc: startAtUtc.toISOString(), endAtUtc: endAtUtc.toISOString() },
        attendeeAdded: newMemberIds.filter((id) => !oldMemberIds.includes(id)),
        attendeeRemoved: removed,
        changedTitle: claimed.previousTitle !== title ? { from: claimed.previousTitle, to: title } : null,
        changedDescription: claimed.previousDescription !== (input.description ?? null)
          ? { from: claimed.previousDescription, to: input.description ?? null } : null,
        agendaBefore: previousAgenda,
        agendaAfter: await repository.agendaSnapshot(transaction, meetingId),
        agendaItemCount: agendaItems.length,
      });
    });
    return meetingWorkspaceService.getDetail(actorUserId, access, meetingId);
  },
};
