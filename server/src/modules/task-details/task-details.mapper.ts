import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";

import type {
  ActivityRecord,
  Attachment,
  AttachmentRecord,
  Subtask,
  SubtaskRecord,
  TaskActivity,
} from "./task-details.types.js";

export function mapSubtask(record: SubtaskRecord): Subtask {
  return {
    ...record,
    id: parsePositiveIntegerId(record.id, "subtask id"),
    taskId: parsePositiveIntegerId(record.taskId, "task id"),
    dueDate: record.dueDate?.toISOString().slice(0, 10) ?? null,
    createdAtUtc: record.createdAtUtc.toISOString(),
    updatedAtUtc: record.updatedAtUtc?.toISOString() ?? null,
    completedAtUtc: record.completedAtUtc?.toISOString() ?? null,
  };
}

export function mapAttachment(record: AttachmentRecord): Attachment {
  return {
    id: record.id,
    taskId:
      record.taskId === null ? null : parsePositiveIntegerId(record.taskId, "task id"),
    subtaskId:
      record.subtaskId === null
        ? null
        : parsePositiveIntegerId(record.subtaskId, "subtask id"),
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    fileExtension: record.fileExtension,
    sizeBytes: Number(record.sizeBytes),
    uploadedAtUtc: record.uploadedAtUtc.toISOString(),
  };
}

export function mapActivity(record: ActivityRecord): TaskActivity {
  let eventData: Record<string, unknown> | null = null;
  if (record.eventDataJson) {
    const parsed: unknown = JSON.parse(record.eventDataJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      eventData = parsed as Record<string, unknown>;
    }
  }
  return {
    id: parsePositiveIntegerId(record.id, "activity id"),
    activityType: record.activityType,
    eventData,
    createdAtUtc: record.createdAtUtc.toISOString(),
  };
}

