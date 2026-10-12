import { getDatabasePool, sql } from "../../database/sql.js";
import type { NotificationEmailCandidate } from "../notifications/notifications.repository.js";
import type { NotificationType } from "../notifications/notifications.types.js";

export type GeneralAssignmentMailEvent = Extract<NotificationType,
  | "GENERAL_TASK_ASSIGNED" | "GENERAL_SUBTASK_ASSIGNED" | "GENERAL_ASSIGNMENT_REMOVED"
  | "GENERAL_TASK_DUE_CHANGED" | "GENERAL_SUBTASK_DUE_CHANGED"
  | "GENERAL_TASK_COMPLETED" | "GENERAL_TASK_REOPENED">;

export function isGeneralAssignmentMailEvent(type: NotificationType): type is GeneralAssignmentMailEvent {
  return type === "GENERAL_TASK_ASSIGNED" || type === "GENERAL_SUBTASK_ASSIGNED" ||
    type === "GENERAL_ASSIGNMENT_REMOVED" || type === "GENERAL_TASK_DUE_CHANGED" ||
    type === "GENERAL_SUBTASK_DUE_CHANGED" || type === "GENERAL_TASK_COMPLETED" ||
    type === "GENERAL_TASK_REOPENED";
}

interface EmailState {
  taskId: number | string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  ownerUserId: number;
  mainAssigneeId: number | null;
  assignedAtUtc: Date;
  dueDate: Date | null;
  listId: number | string;
  subtaskId: number | string | null;
  subtaskTitle: string | null;
  subtaskDueDate: Date | null;
  subtaskAssignmentChangedAtUtc: Date | null;
  effectiveSubtaskAssigneeId: number | null;
}

function safePositiveId(value: unknown): number | null {
  const num = Number(value);
  return value === null || value === undefined || !Number.isSafeInteger(num) || num <= 0 ? null : num;
}
function isoDay(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function currentState(recipientId: number, taskId: number, subtaskId: number | null): Promise<EmailState | null> {
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input("recipient", sql.Int, recipientId)
    .input("taskId", sql.BigInt, taskId)
    .input("subtaskId", sql.BigInt, subtaskId)
    .query<EmailState>(`
      SELECT task.id AS taskId, task.title, task.status,
        task.owner_user_id AS ownerUserId, COALESCE(relation.assignee_user_id, meeting.assignee_user_id) AS mainAssigneeId,
        COALESCE(relation.assigned_at_utc, meeting.assigned_at_utc) AS assignedAtUtc, task.due_date AS dueDate,
        task.list_id AS listId,
        child.id AS subtaskId, child.title AS subtaskTitle,
        child.due_date AS subtaskDueDate,
        child.assignment_changed_at_utc AS subtaskAssignmentChangedAtUtc,
        COALESCE(child.assignee_user_id, meeting.assignee_user_id, relation.assignee_user_id, task.owner_user_id)
          AS effectiveSubtaskAssigneeId
      FROM dbo.TM_tasks AS task
      LEFT JOIN dbo.TM_general_task_assignments AS relation ON relation.task_id = task.id
      LEFT JOIN dbo.TM_meeting_action_items AS meeting ON meeting.task_id = task.id
      JOIN dbo.TM_lists AS list ON list.id = task.list_id AND list.archived_at_utc IS NULL
      JOIN dbo.TM_user_access AS access ON access.portal_user_id = @recipient AND access.is_active = 1
      JOIN dbo.users AS portal ON portal.USER_ID = access.portal_user_id AND portal.IS_ACTIVE = 1
      LEFT JOIN dbo.TM_subtasks AS child ON child.task_id = task.id
        AND child.id = @subtaskId AND child.deleted_at_utc IS NULL
      WHERE task.id = @taskId AND task.deleted_at_utc IS NULL
        AND task.kpi_instance_id IS NULL AND task.list_id IS NOT NULL
        AND (relation.task_id IS NOT NULL OR meeting.task_id IS NOT NULL)
        AND (meeting.task_id IS NULL OR task.owner_user_id = @recipient OR EXISTS (
          SELECT 1 FROM dbo.TM_meeting_attendees AS invitee
          WHERE invitee.meeting_id = meeting.meeting_id AND invitee.attendee_user_id = @recipient
        ));
    `);
  return result.recordset[0] ?? null;
}

/**
 * Builds an authorized, minimal payload from *current* SQL Server state.
 * Called at queue time and again immediately before SMTP; a revoked assignee
 * never receives task or subtask contents from a stale queued job.
 */
export async function buildGeneralAssignmentEmailPayload(
  recipientUserId: number,
  event: GeneralAssignmentMailEvent,
  input: Pick<NotificationEmailCandidate, "taskId" | "subtaskId" | "eventDate" | "createdAtUtc">,
): Promise<Record<string, unknown> | null> {
  const taskId = safePositiveId(input.taskId);
  if (taskId === null) return null;
  const isChild = event === "GENERAL_SUBTASK_ASSIGNED" ||
    event === "GENERAL_SUBTASK_DUE_CHANGED" ||
    (event === "GENERAL_ASSIGNMENT_REMOVED" && input.subtaskId !== null);
  const subtaskId = input.subtaskId === null ? null : safePositiveId(input.subtaskId);
  if (isChild && subtaskId === null) return null;
  const state = await currentState(recipientUserId, taskId, isChild ? subtaskId : null);
  if (!state || state.status === "CANCELLED" || (isChild && state.subtaskId === null)) return null;

  const assignedToThisUser = isChild
    ? state.effectiveSubtaskAssigneeId === recipientUserId
    : state.mainAssigneeId === recipientUserId;

  if (event === "GENERAL_ASSIGNMENT_REMOVED") {
    if (assignedToThisUser) return null;
    // Never include a title, a subtask ID, other assignees, or a clickable task link.
    return { event, taskId, ...(isChild ? { subtaskId } : {}),
      notice: "An assignment was removed from your workload." };
  }

  if (event === "GENERAL_TASK_ASSIGNED" || event === "GENERAL_SUBTASK_ASSIGNED") {
    if (!assignedToThisUser || state.status === "DONE") return null;
    // Drop obsolete assigned notices after an intervening reassignment.
    const recordedAt = input.createdAtUtc instanceof Date
      ? input.createdAtUtc.getTime() : Date.parse(String(input.createdAtUtc));
    const changedAt = isChild
      ? (state.subtaskAssignmentChangedAtUtc ?? state.assignedAtUtc).getTime()
      : state.assignedAtUtc.getTime();
    if (!Number.isFinite(recordedAt) || recordedAt < changedAt) return null;
  }

  if (event === "GENERAL_TASK_DUE_CHANGED" || event === "GENERAL_SUBTASK_DUE_CHANGED") {
    if (!assignedToThisUser) return null;
    const expected = isoDay(input.eventDate);
    if (expected !== isoDay(isChild ? state.subtaskDueDate : state.dueDate)) return null;
  }

  if (event === "GENERAL_TASK_COMPLETED" || event === "GENERAL_TASK_REOPENED") {
    if (recipientUserId !== state.ownerUserId && recipientUserId !== state.mainAssigneeId) return null;
    if (event === "GENERAL_TASK_COMPLETED" && state.status !== "DONE") return null;
    if (event === "GENERAL_TASK_REOPENED" && state.status !== "TODO" && state.status !== "IN_PROGRESS") return null;
  }

  const isOwner = recipientUserId === state.ownerUserId;
  const href = isOwner
    ? `/lists/${state.listId}?taskId=${taskId}`
    : `/assigned-to-me?taskId=${taskId}`;
  const dueDate = isoDay(isChild ? state.subtaskDueDate : state.dueDate);
  return {
    event,
    taskTitle: state.title,
    ...(isChild ? { subtaskTitle: state.subtaskTitle } : {}),
    dueDate,
    href,
    ...(event === "GENERAL_TASK_ASSIGNED" || event === "GENERAL_SUBTASK_ASSIGNED"
      ? { eventRecordedAtUtc: input.createdAtUtc instanceof Date
        ? input.createdAtUtc.toISOString() : String(input.createdAtUtc) } : {}),
    // Revalidated at send-time, never disclose sibling subtask details.
    taskId,
    ...(isChild ? { subtaskId } : {}),
  };
}

/** Trusted fields only; called by the SMTP worker for persistent queued payloads. */
export async function refreshGeneralAssignmentEmailPayload(
  recipientUserId: number,
  event: GeneralAssignmentMailEvent,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const eventDay = typeof payload.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)
    ? new Date(`${payload.dueDate}T00:00:00Z`) : null;
  const eventTime = typeof payload.eventRecordedAtUtc === "string" ? new Date(payload.eventRecordedAtUtc) : null;
  const result = await buildGeneralAssignmentEmailPayload(recipientUserId, event, {
    taskId: safePositiveId(payload.taskId),
    subtaskId: safePositiveId(payload.subtaskId),
    eventDate: eventDay,
    createdAtUtc: eventTime ?? new Date(0),
  });
  // Due-date updates can explicitly clear a due date. The null is intentional.
  return result;
}
