import { createHash } from "node:crypto";

import { withTransaction } from "../../database/transaction.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  createPreparedMeetingInTransaction,
  prepareMeetingCreationInTransaction,
  type PreparedMeetingCreation,
} from "./meeting-workflow.service.js";
import type { CreateMeetingInput } from "./meeting-workflow.types.js";
import {
  findMeetingSeriesInternalConflicts,
  resolveMeetingSeriesOccurrences,
} from "./meeting-series.recurrence.js";
import { meetingSeriesRepository } from "./meeting-series.repository.js";
import { meetingSeriesPreviewBodySchema } from "./meeting-series.schemas.js";
import type {
  CreateMeetingSeriesBody,
  MeetingSeriesAttachmentBody,
  MeetingSeriesListQuery,
  MeetingSeriesPreviewBody,
} from "./meeting-series.schemas.js";
import {
  MEETING_SERIES_TIME_ZONE,
  type MeetingSeriesAttachmentUploadResult,
  type MeetingSeriesCreateResult,
  type MeetingSeriesDetail,
  type MeetingSeriesListResult,
  type MeetingSeriesMembershipLink,
  type MeetingSeriesPreview,
  type MeetingSeriesPreviewOccurrence,
  type MeetingSeriesResolvedOccurrence,
  type MeetingSeriesValidationIssue,
} from "./meeting-series.types.js";
import { meetingSchedulingRepository } from "./meeting-scheduling.repository.js";
import { meetingSchedulingService } from "./meeting-scheduling.service.js";
import { meetingNotificationsService } from "./meeting-notifications.service.js";
import { storeMeetingAttachment, removeStoredMeetingAttachment } from "./meeting-attachment-storage.js";
import { validateMeetingAttachmentFile } from "./meeting-attachment-validation.js";
import { MAX_MEETING_ATTACHMENTS } from "./meeting-attachment-upload.middleware.js";
import { meetingWorkspaceRepository } from "./meeting-workspace.repository.js";

interface PreparedOccurrence {
  occurrence: MeetingSeriesResolvedOccurrence;
  prepared: PreparedMeetingCreation;
}

function seriesCreateFailed(): AppError {
  return new AppError({
    statusCode: 500,
    code: "MEETING_SERIES_CREATE_FAILED",
    message: "Meeting Series could not be created.",
  });
}

function assertCreationRequestLock(lockResult: number): void {
  if (lockResult >= 0) return;
  throw new AppError({
    statusCode: 409,
    code: "MEETING_SERIES_CREATE_BUSY",
    message: "This Meeting Series creation request is already being processed. Try again.",
  });
}

function assertAttachmentRequestLock(lockResult: number): void {
  if (lockResult >= 0) return;
  throw new AppError({
    statusCode: 409,
    code: "MEETING_SERIES_ATTACHMENT_BUSY",
    message: "This Meeting Series attachment request is already being processed. Try again.",
  });
}

function assertAttachmentReplayMatches(
  replay: readonly {
    attachmentScope: "COMMON" | "OCCURRENCE";
    attachmentOccurrenceKey: string | null;
  }[],
  input: MeetingSeriesAttachmentBody,
): void {
  if (replay.length === 0) return;
  const expectedOccurrenceKey = input.scope === "OCCURRENCE" ? input.occurrenceKey ?? null : null;
  const matches = replay.every(
    (item) =>
      item.attachmentScope === input.scope &&
      item.attachmentOccurrenceKey === expectedOccurrenceKey,
  );
  if (matches) return;
  throw new AppError({
    statusCode: 409,
    code: "MEETING_SERIES_ATTACHMENT_REQUEST_MISMATCH",
    message: "This attachment request ID was already used for a different Meeting Series attachment scope.",
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function meetingSeriesRequestFingerprint(input: MeetingSeriesPreviewBody): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex")
    .toUpperCase();
}

function asMeetingInput(occurrence: MeetingSeriesResolvedOccurrence): CreateMeetingInput {
  return {
    title: occurrence.title,
    description: occurrence.description,
    roomId: occurrence.roomId,
    startAtUtc: occurrence.startAtUtc,
    endAtUtc: occurrence.endAtUtc,
    organizerAttending: occurrence.organizerAttending,
    attendeeUserIds: [...occurrence.attendeeUserIds],
    agendaItems: occurrence.agendaItems.map((item) => ({ ...item })),
    followUpOfMeetingId: null,
  };
}

function estimatedParticipantCount(actorUserId: number, occurrence: MeetingSeriesResolvedOccurrence): number {
  const attendees = new Set(occurrence.attendeeUserIds.filter((userId) => userId !== actorUserId));
  if (occurrence.organizerAttending) attendees.add(actorUserId);
  return attendees.size;
}

function issueFromError(error: AppError): MeetingSeriesValidationIssue {
  return {
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

function internalConflictIssues(
  occurrences: readonly MeetingSeriesResolvedOccurrence[],
): Map<string, MeetingSeriesValidationIssue[]> {
  const issues = new Map<string, MeetingSeriesValidationIssue[]>();
  for (const conflict of findMeetingSeriesInternalConflicts(occurrences)) {
    const details = { ...conflict };
    const issue: MeetingSeriesValidationIssue = {
      code: "MEETING_SERIES_INTERNAL_CONFLICT",
      message: "Two Meetings in this Series overlap in the same Meeting Room.",
      details,
    };
    for (const key of [conflict.firstOccurrenceKey, conflict.secondOccurrenceKey]) {
      const current = issues.get(key) ?? [];
      current.push(issue);
      issues.set(key, current);
    }
  }
  return issues;
}

async function assertCoordinator(
  transaction: DatabaseTransaction,
  actorUserId: number,
): Promise<void> {
  await meetingSchedulingService.assertCoordinatorPermission(transaction, actorUserId);
}

async function prepareAll(
  transaction: DatabaseTransaction,
  actorUserId: number,
  occurrences: readonly MeetingSeriesResolvedOccurrence[],
): Promise<PreparedOccurrence[]> {
  const prepared: PreparedOccurrence[] = [];
  for (const occurrence of occurrences) {
    prepared.push({
      occurrence,
      prepared: await prepareMeetingCreationInTransaction(
        transaction,
        actorUserId,
        asMeetingInput(occurrence),
        "DIRECT",
      ),
    });
  }
  return prepared;
}

async function replayIfExisting(
  transaction: DatabaseTransaction,
  actorUserId: number,
  creationRequestId: string,
  fingerprint: string,
): Promise<MeetingSeriesCreateResult | null> {
  assertCreationRequestLock(
    await meetingSeriesRepository.acquireCreationRequestLock(
      transaction,
      actorUserId,
      creationRequestId,
    ),
  );

  const existing = await meetingSeriesRepository.findByCreationRequestId(
    transaction,
    actorUserId,
    creationRequestId,
  );
  if (!existing) return null;

  if (existing.requestFingerprint !== fingerprint) {
    throw new AppError({
      statusCode: 409,
      code: "MEETING_SERIES_IDEMPOTENCY_CONFLICT",
      message: "This Meeting Series creation request ID was already used with different data.",
    });
  }

  return {
    seriesId: existing.seriesId,
    creationRequestId: existing.creationRequestId,
    meetingIds: await meetingSeriesRepository.listMeetingIds(transaction, existing.seriesId),
    replayed: true,
  };
}

function deriveSeriesState(members: readonly import("./meeting-series.types.js").MeetingSeriesMemberSummary[]): import("./meeting-series.types.js").MeetingSeriesDerivedState {
  if (members.length > 0 && members.every((member) => member.status === "CANCELLED")) return "ALL_CANCELLED";
  const now = Date.now();
  if (members.some((member) => member.status === "SCHEDULED" && member.currentStartAtUtc && new Date(member.currentStartAtUtc).getTime() >= now)) {
    return "UPCOMING";
  }
  return "COMPLETED";
}

async function assertCoordinatorRead(actorUserId: number): Promise<void> {
  await withTransaction((transaction) => assertCoordinator(transaction, actorUserId));
}

function parseSeriesSnapshot(record: import("./meeting-series.repository.js").MeetingSeriesDetailRecord) {
  let defaultsRaw: unknown;
  let recurrenceRaw: unknown;
  try {
    defaultsRaw = JSON.parse(record.defaultsJson);
    recurrenceRaw = JSON.parse(record.recurrenceDefinitionJson);
  } catch {
    throw new AppError({
      statusCode: 500,
      code: "MEETING_SERIES_SNAPSHOT_INVALID",
      message: "Stored Meeting Series creation data is invalid.",
    });
  }
  const recurrence = recurrenceRaw as { schedule?: unknown; exceptions?: unknown };
  const parsed = meetingSeriesPreviewBodySchema.safeParse({
    timeZone: record.timeZone,
    defaults: defaultsRaw,
    schedule: recurrence.schedule,
    exceptions: recurrence.exceptions ?? [],
  });
  if (!parsed.success) {
    throw new AppError({
      statusCode: 500,
      code: "MEETING_SERIES_SNAPSHOT_INVALID",
      message: "Stored Meeting Series creation data is invalid.",
    });
  }
  return parsed.data;
}

export const meetingSeriesService = {
  async preview(actorUserId: number, input: MeetingSeriesPreviewBody): Promise<MeetingSeriesPreview> {
    await withTransaction((transaction) => assertCoordinator(transaction, actorUserId));

    const occurrences = resolveMeetingSeriesOccurrences(input);
    const internalIssues = internalConflictIssues(occurrences);
    const preparation = await withTransaction(async (transaction) => {
      await assertCoordinator(transaction, actorUserId);
      const results = new Map<
        string,
        { prepared: PreparedMeetingCreation | null; issues: MeetingSeriesValidationIssue[] }
      >();

      for (const occurrence of occurrences) {
        try {
          const prepared = await prepareMeetingCreationInTransaction(
            transaction,
            actorUserId,
            asMeetingInput(occurrence),
            "DIRECT",
          );
          results.set(occurrence.occurrenceKey, { prepared, issues: [] });
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          results.set(occurrence.occurrenceKey, {
            prepared: null,
            issues: [issueFromError(error)],
          });
        }
      }

      return results;
    });

    const previewOccurrences: MeetingSeriesPreviewOccurrence[] = [];
    for (const occurrence of occurrences) {
      const preparedResult = preparation.get(occurrence.occurrenceKey);
      const issues = [
        ...(internalIssues.get(occurrence.occurrenceKey) ?? []),
        ...(preparedResult?.issues ?? []),
      ];
      let roomCapacity: number | null = null;
      const participantCount = preparedResult?.prepared
        ? preparedResult.prepared.attendeeUserIds.length
        : estimatedParticipantCount(actorUserId, occurrence);

      if (preparedResult?.prepared) {
        try {
          const availability = await meetingSchedulingService.getAvailability({
            roomId: occurrence.roomId,
            startAtUtc: occurrence.startAtUtc,
            endAtUtc: occurrence.endAtUtc,
            participantCount,
          });
          roomCapacity = availability.roomCapacity;
          if (!availability.isRoomActive) {
            issues.push({
              code: "ACTIVE_MEETING_ROOM_REQUIRED",
              message: "Choose an active Meeting Room.",
            });
          } else if (!availability.hasCapacity) {
            issues.push({
              code: "MEETING_ROOM_CAPACITY_EXCEEDED",
              message: "The selected Meeting Room does not have enough capacity for all participants.",
              details: { capacity: availability.roomCapacity, participantCount },
            });
          } else if (!availability.isAvailable) {
            issues.push({
              code: "MEETING_ROOM_TIME_CONFLICT",
              message: "The selected Meeting Room is already reserved during this time.",
            });
          }
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          issues.push(issueFromError(error));
        }
      }

      const uniqueIssues = issues.filter(
        (issue, index, all) => all.findIndex((candidate) => candidate.code === issue.code) === index,
      );
      previewOccurrences.push({
        ...occurrence,
        participantCount,
        roomCapacity,
        validation: { isValid: uniqueIssues.length === 0, issues: uniqueIssues },
      });
    }

    return {
      creationMode: input.schedule.mode,
      timeZone: MEETING_SERIES_TIME_ZONE,
      occurrenceCount: previewOccurrences.length,
      customizedCount: previewOccurrences.filter((occurrence) => occurrence.isCustomized).length,
      canCreate: previewOccurrences.every((occurrence) => occurrence.validation.isValid),
      occurrences: previewOccurrences,
    };
  },

  async create(actorUserId: number, input: CreateMeetingSeriesBody): Promise<MeetingSeriesCreateResult> {
    const { creationRequestId, ...previewInput } = input;
    const fingerprint = meetingSeriesRequestFingerprint(previewInput);

    const result = await withTransaction(async (transaction) => {
      await assertCoordinator(transaction, actorUserId);

      const replay = await replayIfExisting(
        transaction,
        actorUserId,
        creationRequestId,
        fingerprint,
      );
      if (replay) return replay;

      const occurrences = resolveMeetingSeriesOccurrences(previewInput);
      const internalConflicts = findMeetingSeriesInternalConflicts(occurrences);
      if (internalConflicts.length > 0) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_SERIES_INTERNAL_CONFLICT",
          message: "Two or more Meetings in this Series overlap in the same Meeting Room.",
          details: { conflicts: internalConflicts },
        });
      }

      const prepared = await prepareAll(transaction, actorUserId, occurrences);
      await meetingSchedulingService.acquireRoomLocksInTransaction(
        transaction,
        prepared.map(({ occurrence }) => occurrence.roomId),
      );

      for (const item of prepared) {
        await meetingSchedulingService.assertLockedScheduleAvailable(transaction, {
          roomId: item.occurrence.roomId,
          startAtUtc: item.prepared.startAtUtc,
          endAtUtc: item.prepared.endAtUtc,
          participantCount: item.prepared.attendeeUserIds.length,
          excludeMeetingId: null,
        });
      }

      const series = await meetingSeriesRepository.createSeries(transaction, {
        actorUserId,
        creationRequestId,
        requestFingerprint: fingerprint,
        creationMode: previewInput.schedule.mode,
        recurrenceDefinitionJson: JSON.stringify({
          schedule: previewInput.schedule,
          exceptions: previewInput.exceptions,
        }),
        defaultsJson: JSON.stringify(previewInput.defaults),
        timeZone: previewInput.timeZone,
      });
      if (!series) throw seriesCreateFailed();

      const meetingIds: number[] = [];
      for (const item of prepared) {
        const created = await createPreparedMeetingInTransaction(
          transaction,
          actorUserId,
          item.prepared,
          "DIRECT_CREATED",
          "DIRECT",
        );
        await meetingSchedulingService.commitPendingRevisionInTransaction(
          transaction,
          actorUserId,
          created.meetingId,
          created.revisionId,
          created.revisionRowVersion,
        );

        await meetingSchedulingRepository.addActivity(
          transaction,
          created.meetingId,
          actorUserId,
          "CREATED_FROM_SERIES",
          {
            seriesId: series.seriesId,
            sequenceNumber: item.occurrence.sequenceNumber,
            occurrenceKey: item.occurrence.occurrenceKey,
            sourceType: item.occurrence.sourceType,
            originalStartAtUtc: item.occurrence.originalStartAtUtc,
            originalEndAtUtc: item.occurrence.originalEndAtUtc,
            isCustomized: item.occurrence.isCustomized,
            overrideKinds: item.occurrence.overrideKinds,
          },
        );

        await meetingSeriesRepository.addMember(transaction, {
          seriesId: series.seriesId,
          meetingId: created.meetingId,
          sequenceNumber: item.occurrence.sequenceNumber,
          occurrenceKey: item.occurrence.occurrenceKey,
          sourceType: item.occurrence.sourceType,
          originalStartAtUtc: item.occurrence.originalStartAtUtc
            ? new Date(item.occurrence.originalStartAtUtc)
            : null,
          originalEndAtUtc: item.occurrence.originalEndAtUtc
            ? new Date(item.occurrence.originalEndAtUtc)
            : null,
          initialStartAtUtc: item.prepared.startAtUtc,
          initialEndAtUtc: item.prepared.endAtUtc,
          initialRoomId: item.occurrence.roomId,
          customizationJson: item.occurrence.isCustomized
            ? JSON.stringify({
                overrideKinds: item.occurrence.overrideKinds,
                date: item.occurrence.date,
                startTime: item.occurrence.startTime,
                endTime: item.occurrence.endTime,
                roomId: item.occurrence.roomId,
                title: item.occurrence.title,
                description: item.occurrence.description,
                organizerAttending: item.occurrence.organizerAttending,
                attendeeUserIds: item.occurrence.attendeeUserIds,
                agendaItems: item.occurrence.agendaItems,
              })
            : null,
        });
        meetingIds.push(created.meetingId);
      }

      return {
        seriesId: series.seriesId,
        creationRequestId: series.creationRequestId,
        meetingIds,
        replayed: false,
      };
    });

    await meetingNotificationsService.safeSeriesScheduled(result.seriesId);
    return result;
  },

  async uploadAttachment(
    actorUserId: number,
    seriesId: number,
    input: MeetingSeriesAttachmentBody,
    file: Express.Multer.File,
  ): Promise<MeetingSeriesAttachmentUploadResult> {
    const { originalFileName, extension, mimeType } = validateMeetingAttachmentFile(file);

    const preflightReplay = await withTransaction(async (transaction) => {
      await assertCoordinator(transaction, actorUserId);
      const replay = await meetingSeriesRepository.listSeriesAttachmentTargetsByRequestId(
        transaction,
        actorUserId,
        seriesId,
        input.attachmentRequestId,
      );
      assertAttachmentReplayMatches(replay, input);
      return replay;
    });
    if (preflightReplay.length > 0) {
      return {
        seriesId,
        attachmentRequestId: input.attachmentRequestId,
        scope: input.scope,
        occurrenceKey: input.occurrenceKey ?? null,
        associatedMeetingCount: preflightReplay.length,
        replayed: true,
      };
    }

    const storageKey = await storeMeetingAttachment(file.buffer, extension);
    let keepStoredFile = false;
    try {
      const outcome = await withTransaction(async (transaction) => {
        await assertCoordinator(transaction, actorUserId);
        assertAttachmentRequestLock(
          await meetingSeriesRepository.acquireAttachmentRequestLock(
            transaction,
            actorUserId,
            seriesId,
            input.attachmentRequestId,
          ),
        );

        const lockedReplay = await meetingSeriesRepository.listSeriesAttachmentTargetsByRequestId(
          transaction,
          actorUserId,
          seriesId,
          input.attachmentRequestId,
        );
        assertAttachmentReplayMatches(lockedReplay, input);
        if (lockedReplay.length > 0) {
          return { associatedMeetingCount: lockedReplay.length, replayed: true };
        }

        const targets = await meetingSeriesRepository.listOwnedAttachmentTargets(
          transaction,
          actorUserId,
          seriesId,
          input.scope === "OCCURRENCE" ? input.occurrenceKey ?? null : null,
        );
        if (targets.length === 0) {
          throw new AppError({
            statusCode: 404,
            code: input.scope === "OCCURRENCE" ? "MEETING_SERIES_OCCURRENCE_NOT_FOUND" : "MEETING_SERIES_NOT_FOUND",
            message: input.scope === "OCCURRENCE" ? "Meeting Series occurrence was not found." : "Meeting Series was not found.",
          });
        }
        if (input.scope === "OCCURRENCE" && targets.length !== 1) {
          throw new AppError({
            statusCode: 409,
            code: "MEETING_SERIES_OCCURRENCE_INVALID",
            message: "Meeting Series occurrence could not be resolved.",
          });
        }

        for (const target of targets) {
          const count = await meetingWorkspaceRepository.countActiveAttachments(transaction, target.meetingId);
          if (count >= MAX_MEETING_ATTACHMENTS) {
            throw new AppError({
              statusCode: 409,
              code: "MEETING_ATTACHMENT_LIMIT_REACHED",
              message: "A Meeting can have at most 10 active attachments.",
              details: { meetingId: target.meetingId },
            });
          }
        }

        for (const target of targets) {
          const created = await meetingWorkspaceRepository.createAttachment(transaction, {
            meetingId: target.meetingId,
            actorUserId,
            originalFileName,
            storageKey,
            mimeType,
            fileExtension: extension,
            sizeBytes: file.size,
            seriesAttachmentRequestId: input.attachmentRequestId,
            seriesAttachmentScope: input.scope,
            seriesOccurrenceKey: input.scope === "OCCURRENCE" ? input.occurrenceKey ?? null : null,
          });
          if (!created) throw seriesCreateFailed();
          await meetingSchedulingRepository.addActivity(transaction, target.meetingId, actorUserId, "ATTACHMENT_ADDED", {
            attachmentId: created.id,
            fileName: originalFileName,
            sizeBytes: file.size,
            seriesId,
            seriesAttachmentScope: input.scope,
          });
        }

        if (input.scope === "OCCURRENCE" && input.occurrenceKey) {
          await meetingSeriesRepository.markOccurrenceAttachmentCustomized(transaction, seriesId, input.occurrenceKey);
        }
        return { associatedMeetingCount: targets.length, replayed: false };
      });

      keepStoredFile = !outcome.replayed;
      return {
        seriesId,
        attachmentRequestId: input.attachmentRequestId,
        scope: input.scope,
        occurrenceKey: input.occurrenceKey ?? null,
        associatedMeetingCount: outcome.associatedMeetingCount,
        replayed: outcome.replayed,
      };
    } finally {
      if (!keepStoredFile) {
        await removeStoredMeetingAttachment(storageKey);
      }
    }
  },

  async list(actorUserId: number, query: MeetingSeriesListQuery): Promise<MeetingSeriesListResult> {
    await assertCoordinatorRead(actorUserId);
    return meetingSeriesRepository.listCreatedByUser({
      actorUserId,
      search: query.search,
      state: query.state,
      page: query.page,
      pageSize: query.pageSize,
    });
  },

  async getDetail(actorUserId: number, seriesId: number): Promise<MeetingSeriesDetail> {
    await assertCoordinatorRead(actorUserId);
    const record = await meetingSeriesRepository.findDetailRecord(actorUserId, seriesId);
    if (!record) {
      throw new AppError({
        statusCode: 404,
        code: "MEETING_SERIES_NOT_FOUND",
        message: "Meeting Series was not found.",
      });
    }

    const snapshot = parseSeriesSnapshot(record);
    const members = await meetingSeriesRepository.listMembers(seriesId);
    const defaultAttendees = await meetingSeriesRepository.listPortalParticipants(snapshot.defaults.attendeeUserIds);
    const upcomingCount = members.filter(
      (member) => member.status === "SCHEDULED" && member.currentStartAtUtc && new Date(member.currentStartAtUtc).getTime() >= Date.now(),
    ).length;
    const cancelledCount = members.filter((member) => member.status === "CANCELLED").length;
    const customizedCount = members.filter((member) => member.wasCustomizedAtCreation).length;

    return {
      seriesId: record.seriesId,
      createdByUserId: record.createdByUserId,
      creationMode: record.creationMode,
      timeZone: MEETING_SERIES_TIME_ZONE,
      createdAtUtc: record.createdAtUtc.toISOString(),
      rowVersion: record.rowVersion,
      defaults: snapshot.defaults,
      schedule: snapshot.schedule,
      exceptions: snapshot.exceptions,
      defaultAttendees,
      meetingCount: members.length,
      upcomingCount,
      cancelledCount,
      customizedCount,
      state: deriveSeriesState(members),
      members,
    };
  },

  async getMeetingLink(actorUserId: number, meetingId: number): Promise<MeetingSeriesMembershipLink | null> {
    await assertCoordinatorRead(actorUserId);
    return meetingSeriesRepository.findMembershipLink(actorUserId, meetingId);
  },

};


