import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { TaskHubAccess } from "../auth/auth.types.js";
import { meetingActionItemsRepository } from "../meeting-action-items/meeting-action-items.repository.js";
import {
  canReadMeetingByRelationship,
  meetingNotFoundError,
  requireMeetingContentAccess,
} from "../meetings/meeting-content-access.js";
import { meetingWorkspaceRepository } from "../meetings/meeting-workspace.repository.js";
import { meetingWorkflowRepository } from "../meetings/meeting-workflow.repository.js";
import { meetingFollowUpRepository } from "./meeting-followup.repository.js";
import type {
  CreateMeetingDecisionInput,
  MeetingFollowUpData,
  RelatedMeetingFamily,
  SaveMeetingFollowUpNotesInput,
  UpdateMeetingDecisionInput,
} from "./meeting-followup.types.js";

function decisionNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEETING_DECISION_NOT_FOUND",
    message: "Meeting Decision was not found.",
  });
}

function staleDecision(): AppError {
  return new AppError({
    statusCode: 409,
    code: "STALE_MEETING_DECISION",
    message: "This Meeting Decision was changed by another user. Refresh and try again.",
  });
}

function staleNotes(): AppError {
  return new AppError({
    statusCode: 409,
    code: "STALE_MEETING_NOTES",
    message: "These Meeting Notes were changed by another user. Refresh and try again.",
  });
}

async function canManageContentNow(
  actorUserId: number,
  context: Awaited<ReturnType<typeof requireMeetingContentAccess>>["context"],
  transaction?: DatabaseTransaction,
): Promise<boolean> {
  if (
    context.organizerUserId !== actorUserId ||
    context.status !== "SCHEDULED" ||
    context.currentRevisionId === null
  ) {
    return false;
  }

  const startAtUtc = await meetingWorkspaceRepository.approvedStart(
    context.meetingId,
    context.currentRevisionId,
    transaction,
  );
  return startAtUtc !== null && startAtUtc.getTime() <= Date.now();
}

async function requireWritableFollowUp(
  actorUserId: number,
  access: TaskHubAccess,
  meetingId: number,
  transaction: DatabaseTransaction,
) {
  const resolved = await requireMeetingContentAccess(
    actorUserId,
    access,
    meetingId,
    transaction,
  );
  const { context } = resolved;

  if (context.organizerUserId !== actorUserId) {
    throw new AppError({
      statusCode: 403,
      code: "MEETING_ORGANIZER_REQUIRED",
      message: "Only the Meeting Organizer can manage Decisions and Meeting Notes.",
    });
  }

  if (context.status !== "SCHEDULED" || context.currentRevisionId === null) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_FOLLOWUP_READ_ONLY",
      message: "Meeting Follow-up content is read-only unless the Meeting is scheduled.",
    });
  }

  const startAtUtc = await meetingWorkspaceRepository.approvedStart(
    meetingId,
    context.currentRevisionId,
    transaction,
  );
  if (!startAtUtc) throw meetingNotFoundError();
  if (startAtUtc.getTime() > Date.now()) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_FOLLOWUP_NOT_STARTED",
      message: "Follow-up becomes available when the approved Meeting start time is reached.",
    });
  }

  return context;
}

async function assertAgendaRelationship(
  transaction: DatabaseTransaction,
  meetingId: number,
  agendaItemId: number | null | undefined,
): Promise<void> {
  if (agendaItemId === null || agendaItemId === undefined) return;
  const belongs = await meetingActionItemsRepository.agendaBelongsToMeeting(
    transaction,
    meetingId,
    agendaItemId,
  );
  if (!belongs) {
    throw new AppError({
      statusCode: 400,
      code: "MEETING_FOLLOWUP_AGENDA_INVALID",
      message: "The selected Agenda topic does not belong to this Meeting.",
    });
  }
}

export const meetingFollowUpService = {
  async get(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
  ): Promise<MeetingFollowUpData> {
    const resolved = await requireMeetingContentAccess(actorUserId, access, meetingId);
    const [decisions, notes, actionSummary, canManageContent] = await Promise.all([
      meetingFollowUpRepository.listDecisions(meetingId),
      meetingFollowUpRepository.getNotes(meetingId),
      meetingActionItemsRepository.summarizeForMeeting(meetingId, actorUserId),
      canManageContentNow(actorUserId, resolved.context),
    ]);

    return {
      summary: {
        actionItems: actionSummary.total,
        completed: actionSummary.completed,
        overdue: actionSummary.overdue,
        decisions: decisions.length,
      },
      decisions,
      notes,
      canManageContent,
    };
  },

  async relatedMeetings(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
  ): Promise<RelatedMeetingFamily> {
    await requireMeetingContentAccess(actorUserId, access, meetingId);
    const family = await meetingWorkflowRepository.listRelatedMeetingFamily(meetingId, actorUserId);

    const visibleItems = family.items
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
      .map(({ meeting }) => ({
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        organizer: meeting.organizer,
        room: {
          id: meeting.room.id,
          code: meeting.room.code,
          nameAr: meeting.room.nameAr,
          nameEn: meeting.room.nameEn,
          locationText: meeting.room.locationText,
          colorKey: meeting.room.colorKey,
        },
        startAtUtc: meeting.startAtUtc,
        endAtUtc: meeting.endAtUtc,
        participantCount: meeting.participantCount,
        isCurrent: meeting.id === meetingId,
      }));

    if (!visibleItems.some((item) => item.isCurrent)) throw meetingNotFoundError();
    return { items: visibleItems };
  },

  async createDecision(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: CreateMeetingDecisionInput,
  ) {
    const decisionId = await withTransaction(async (transaction) => {
      await requireWritableFollowUp(actorUserId, access, meetingId, transaction);
      await assertAgendaRelationship(transaction, meetingId, input.agendaItemId);
      return meetingFollowUpRepository.createDecision(transaction, meetingId, actorUserId, {
        decisionText: input.decisionText.trim(),
        agendaItemId: input.agendaItemId ?? null,
      });
    });

    const decision = (await meetingFollowUpRepository.listDecisions(meetingId)).find(
      (item) => item.id === decisionId,
    );
    if (!decision) throw decisionNotFound();
    return { decision };
  },

  async updateDecision(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    decisionId: number,
    input: UpdateMeetingDecisionInput,
  ) {
    await withTransaction(async (transaction) => {
      await requireWritableFollowUp(actorUserId, access, meetingId, transaction);
      const locked = await meetingFollowUpRepository.findDecisionForUpdate(
        transaction,
        meetingId,
        decisionId,
      );
      if (!locked) throw decisionNotFound();
      if (locked.rowVersion !== input.rowVersion) throw staleDecision();

      await assertAgendaRelationship(transaction, meetingId, input.agendaItemId);
      const updated = await meetingFollowUpRepository.updateDecision(
        transaction,
        meetingId,
        decisionId,
        actorUserId,
        {
          decisionText: input.decisionText.trim(),
          agendaItemId: input.agendaItemId ?? null,
          rowVersion: input.rowVersion,
        },
      );
      if (!updated) throw staleDecision();
    });

    const decision = (await meetingFollowUpRepository.listDecisions(meetingId)).find(
      (item) => item.id === decisionId,
    );
    if (!decision) throw decisionNotFound();
    return { decision };
  },

  async saveNotes(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: SaveMeetingFollowUpNotesInput,
  ) {
    await withTransaction(async (transaction) => {
      await requireWritableFollowUp(actorUserId, access, meetingId, transaction);
      const locked = await meetingFollowUpRepository.findNotesForUpdate(transaction, meetingId);
      const notesText = input.notesText.trim();

      if (!locked) {
        if (input.rowVersion) throw staleNotes();
        await meetingFollowUpRepository.createNotes(
          transaction,
          meetingId,
          actorUserId,
          notesText,
        );
        return;
      }

      if (!input.rowVersion || locked.rowVersion !== input.rowVersion) throw staleNotes();
      const updated = await meetingFollowUpRepository.updateNotes(
        transaction,
        meetingId,
        actorUserId,
        notesText,
        input.rowVersion,
      );
      if (!updated) throw staleNotes();
    });

    const notes = await meetingFollowUpRepository.getNotes(meetingId);
    if (!notes) throw staleNotes();
    return { notes };
  },
};

