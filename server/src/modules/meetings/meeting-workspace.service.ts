import path from "node:path";

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
import { assertScheduleWindow } from "./meeting-scheduling.policy.js";
import { meetingSchedulingRepository } from "./meeting-scheduling.repository.js";
import { meetingSchedulingService } from "./meeting-scheduling.service.js";
import { meetingWorkspaceRepository, mapMeetingAttachmentRecord } from "./meeting-workspace.repository.js";
import type {
  CancelMeetingInput,
  CreateMeetingRescheduleInput,
  DecideMeetingRescheduleInput,
  MeetingAttachment,
  MeetingDetail,
  MeetingRescheduleQueueItem,
  MeetingTemplate,
  RejectMeetingRescheduleInput,
  SaveMeetingTemplateInput,
  UpdateMeetingRescheduleInput,
  UpdateMeetingTemplateInput,
} from "./meeting-workspace.types.js";
import { meetingWorkflowRepository } from "./meeting-workflow.repository.js";
import { hasMeetingPermission } from "./meetings.policy.js";

function notFound(): AppError {
  return new AppError({ statusCode: 404, code: "MEETING_NOT_FOUND", message: "Meeting was not found." });
}

function stale(): AppError {
  return new AppError({
    statusCode: 409,
    code: "MEETING_WORKSPACE_STALE",
    message: "Meeting data changed after it was loaded. Reload and try again.",
  });
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

async function normalizedActiveAttendees(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  attendeeUserIds: readonly number[],
): Promise<number[]> {
  const normalized = [...new Set(attendeeUserIds)].filter((userId) => userId !== ownerUserId);
  const active = await meetingWorkflowRepository.activeParticipantIds(transaction, normalized);
  if (active.length !== normalized.length) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_MEETING_ATTENDEE",
      message: "One or more selected attendees are not active TaskHub users.",
    });
  }
  return normalized;
}

async function loadDetail(
  actorUserId: number,
  access: TaskHubAccess,
  meetingId: number,
): Promise<MeetingDetail> {
  const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId);
  if (!context) throw notFound();

  const isOrganizer = context.organizerUserId === actorUserId;
  const attendeeCanRead = context.isAttendee && ["SCHEDULED", "CANCELLED"].includes(context.status);
  const coordinatorCanRead =
    hasMeetingPermission(access, "MEETING_COORDINATE") &&
    (context.status === "PENDING_APPROVAL" || context.hasPendingReschedule);

  if (!isOrganizer && !attendeeCanRead && !coordinatorCanRead) throw notFound();

  const [meeting, revisions, activity] = await Promise.all([
    meetingWorkflowRepository.findSummary(meetingId),
    meetingWorkspaceRepository.listRevisions(meetingId),
    meetingWorkspaceRepository.listActivity(meetingId),
  ]);
  if (!meeting) throw notFound();

  const pendingReschedule =
    revisions.find(
      (revision) =>
        revision.revisionType === "RESCHEDULE" && revision.revisionStatus === "PENDING",
    ) ?? null;

  return {
    meeting,
    revisions,
    activity,
    pendingReschedule,
    permissions: {
      canCancel:
        isOrganizer && ["PENDING_APPROVAL", "SCHEDULED"].includes(context.status),
      canReschedule: isOrganizer && context.status === "SCHEDULED" && !context.hasPendingReschedule,
      canManageAttachments:
        isOrganizer && ["PENDING_APPROVAL", "SCHEDULED"].includes(context.status),
      canSaveAsTemplate: isOrganizer && hasMeetingPermission(access, "MEETING_ORGANIZE"),
    },
  };
}

function cleanFileName(rawName: string): string {
  const value = Array.from(path.basename(rawName))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 260);
  if (!value) {
    throw new AppError({
      statusCode: 400,
      code: "MEETING_ATTACHMENT_NAME_INVALID",
      message: "Meeting attachment file name is invalid.",
    });
  }
  return value;
}

function attachmentMimeType(extension: string): string {
  const values: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return values[extension] ?? "application/octet-stream";
}

function signatureMatches(extension: string, buffer: Buffer): boolean {
  if (extension === ".txt") return !buffer.includes(0);
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => buffer[index] === value);
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === ".webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if ([".docx", ".xlsx", ".pptx"].includes(extension)) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  if ([".doc", ".xls", ".ppt"].includes(extension)) {
    const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return ole.every((value, index) => buffer[index] === value);
  }
  return false;
}

async function assertAttachmentReadAccess(
  actorUserId: number,
  access: TaskHubAccess,
  meetingId: number,
): Promise<void> {
  const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId);
  if (!context) throw attachmentNotFound();
  if (context.organizerUserId === actorUserId) return;
  if (context.isAttendee && ["SCHEDULED", "CANCELLED"].includes(context.status)) return;
  if (
    hasMeetingPermission(access, "MEETING_COORDINATE") &&
    (context.status === "PENDING_APPROVAL" || context.hasPendingReschedule)
  ) {
    return;
  }
  throw attachmentNotFound();
}

async function assertAttachmentWriteAccess(
  transaction: DatabaseTransaction,
  actorUserId: number,
  meetingId: number,
): Promise<void> {
  const context = await meetingWorkspaceRepository.findAccessContext(meetingId, actorUserId, transaction);
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
  const attendeeUserIds = await normalizedActiveAttendees(
    transaction,
    ownerUserId,
    input.attendeeUserIds,
  );
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

  async requestReschedule(
    actorUserId: number,
    access: TaskHubAccess,
    meetingId: number,
    input: CreateMeetingRescheduleInput,
  ): Promise<MeetingDetail> {
    await withTransaction(async (transaction) => {
      const context = await meetingWorkspaceRepository.findAccessContext(
        meetingId,
        actorUserId,
        transaction,
      );
      if (!context || context.organizerUserId !== actorUserId) throw notFound();
      if (context.status !== "SCHEDULED" || context.meetingRowVersion !== input.meetingRowVersion) {
        throw stale();
      }
      if (await meetingWorkspaceRepository.pendingRescheduleExistsForUpdate(transaction, meetingId)) {
        throw new AppError({
          statusCode: 409,
          code: "MEETING_RESCHEDULE_ALREADY_PENDING",
          message: "This Meeting already has a pending reschedule request.",
        });
      }

      const startAtUtc = new Date(input.startAtUtc);
      const endAtUtc = new Date(input.endAtUtc);
      assertScheduleWindow(startAtUtc, endAtUtc);
      await assertActiveRoom(transaction, input.roomId);

      const currentRevision = context.currentRevisionId
        ? await meetingSchedulingRepository.findRevisionSchedule(
            transaction,
            meetingId,
            context.currentRevisionId,
          )
        : null;
      if (!currentRevision || currentRevision.revisionStatus !== "APPROVED") throw stale();

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
    });
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
      assertScheduleWindow(startAtUtc, endAtUtc);
      await assertActiveRoom(transaction, input.roomId);
      if (!(await meetingWorkspaceRepository.updatePendingRescheduleSchedule(transaction, meetingId, input))) {
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
    const item = (await listPendingReschedulesInternal()).find((value) => value.meeting.id === meetingId);
    if (!item) throw notFound();
    return item;
  },

  async approveReschedule(
    actorUserId: number,
    meetingId: number,
    input: DecideMeetingRescheduleInput,
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
      await meetingSchedulingService.commitPendingRevisionInTransaction(
        transaction,
        actorUserId,
        meetingId,
        input.revisionId,
        input.revisionRowVersion,
      );
    });
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
    if (file.size <= 0 || file.buffer.length <= 0) {
      throw new AppError({
        statusCode: 400,
        code: "MEETING_ATTACHMENT_EMPTY",
        message: "Meeting attachment must not be empty.",
      });
    }
    const originalFileName = cleanFileName(file.originalname);
    const extension = path.extname(originalFileName).toLowerCase();
    if (!signatureMatches(extension, file.buffer)) {
      throw new AppError({
        statusCode: 400,
        code: "MEETING_ATTACHMENT_SIGNATURE_INVALID",
        message: "Meeting attachment content does not match its file type.",
      });
    }

    const storageKey = await storeMeetingAttachment(file.buffer, extension);
    try {
      const attachmentId = await withTransaction(async (transaction) => {
        await assertAttachmentWriteAccess(transaction, actorUserId, meetingId);
        const count = await meetingWorkspaceRepository.countActiveAttachments(transaction, meetingId);
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
          mimeType: attachmentMimeType(extension),
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

  async removeAttachment(
    actorUserId: number,
    attachmentId: string,
  ): Promise<void> {
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
        { attachmentId, fileName: attachment.originalFileName, sizeBytes: Number(attachment.sizeBytes) },
      );
      return attachment;
    });
    await removeStoredMeetingAttachment(removed.storageKey);
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
      const current = await meetingWorkspaceRepository.findTemplate(ownerUserId, templateId, transaction);
      if (!current || current.rowVersion !== input.rowVersion) throw stale();
      const attendeeUserIds = await validateTemplateInput(
        transaction,
        ownerUserId,
        input,
        templateId,
      );
      if (!(await meetingWorkspaceRepository.updateTemplate(transaction, ownerUserId, templateId, input))) {
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

  async archiveTemplate(ownerUserId: number, templateId: number, rowVersion: string): Promise<void> {
    await withTransaction(async (transaction) => {
      await assertEffectiveOrganizerPermission(transaction, ownerUserId);
      const current = await meetingWorkspaceRepository.findTemplate(ownerUserId, templateId, transaction);
      if (!current || current.rowVersion !== rowVersion) throw stale();
      if (!(await meetingWorkspaceRepository.archiveTemplate(transaction, ownerUserId, templateId, rowVersion))) {
        throw stale();
      }
    });
  },
};
