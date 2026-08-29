import type { PersonalTask } from "../tasks/tasks.types.js";

export interface SubtaskRecord {
  id: number | string;
  taskId: number | string;
  title: string;
  isCompleted: boolean;
  dueDate: Date | null;
  displayOrder: number;
  createdAtUtc: Date;
  updatedAtUtc: Date | null;
  completedAtUtc: Date | null;
}

export interface AttachmentRecord {
  id: string;
  taskId: number | string | null;
  subtaskId: number | string | null;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number | string;
  uploadedAtUtc: Date;
}

export interface ActivityRecord {
  id: number | string;
  activityType: string;
  eventDataJson: string | null;
  createdAtUtc: Date;
}

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  isCompleted: boolean;
  dueDate: string | null;
  displayOrder: number;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  completedAtUtc: string | null;
}

export interface Attachment {
  id: string;
  taskId: number | null;
  subtaskId: number | null;
  originalFileName: string;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number;
  uploadedAtUtc: string;
}

export interface TaskActivity {
  id: number;
  activityType: string;
  eventData: Record<string, unknown> | null;
  createdAtUtc: string;
}

export interface TaskDetails {
  task: PersonalTask;
  subtasks: Subtask[];
  attachments: Attachment[];
  activity: TaskActivity[];
  progress: { completed: number; total: number; percentage: number };
}

