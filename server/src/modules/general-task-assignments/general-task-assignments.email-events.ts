import { randomUUID } from "node:crypto";
import { sql } from "../../database/sql.js";
import type { DatabaseTransaction } from "../../database/types.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import type { GeneralTaskNotificationInput } from "../notifications/notifications.repository.js";

/** In-app + preference-aware email events share the existing notification/outbox pipeline. */
export async function notifyGeneralTask(
  transaction: DatabaseTransaction,
  recipients: ReadonlyArray<number | null | undefined>,
  actorUserId: number,
  event: Omit<GeneralTaskNotificationInput, "dedupeKey"> & { taskOwnerUserId?: number },
): Promise<void> {
  for (const recipient of new Set(recipients)) {
    if (recipient == null || recipient === actorUserId) continue;
    const { taskOwnerUserId, ...notification } = event;
    const ownerScopedEvent = event.type === "GENERAL_TASK_COMPLETED" ||
      event.type === "GENERAL_TASK_REOPENED" || event.type === "GENERAL_SUBTASK_COMPLETED";
    await notificationsRepository.ensureGeneralTaskNotification(recipient, {
      ...notification,
      ...(ownerScopedEvent ? { listId: recipient === taskOwnerUserId ? event.listId : null } : {}),
      dedupeKey: `${event.type}:${event.taskId}:${event.subtaskId ?? "MAIN"}:${recipient}:${randomUUID()}`,
    }, transaction);
  }
}

/** Removal mails deliberately contain no former task/subtask details or deep links. */
export async function notifyRemovedAssignment(
  transaction: DatabaseTransaction,
  actorUserId: number,
  previousAssigneeUserId: number | null,
  taskId: number,
  subtaskId: number | null,
): Promise<void> {
  await notifyGeneralTask(transaction, [previousAssigneeUserId], actorUserId, {
    type: "GENERAL_ASSIGNMENT_REMOVED",
    taskId, subtaskId, listId: null,
    subjectTitle: "Assignment changed",
    contextTitle: "An assignment was removed from your workload.",
  });
}


/** Email + in-app notification for a creator when an authorized collaborator adds
 * evidence or notes. No note body or attachment bytes enter notifications/outbox. */
export async function notifyTaskOwnerActivity(
  transaction: DatabaseTransaction,
  ownerUserId: number,
  actorUserId: number,
  input: { type: "TASK_WORK_NOTE_ADDED" | "TASK_ATTACHMENT_ADDED"; taskId: number;
    listId: number | null; subtaskId?: number | null; taskTitle: string },
): Promise<void> {
  if (ownerUserId === actorUserId) return;
  const actor = await transaction.request().input("actor", sql.Int, actorUserId)
    .query<{ name: string }>(`SELECT TOP (1)
      COALESCE(NULLIF(LTRIM(RTRIM(USER_NAME)), N''), CONVERT(nvarchar(100), USER_CODE)) AS name
      FROM dbo.users WHERE USER_ID=@actor;`);
  const actorName = actor.recordset[0]?.name ?? "A team member";
  await notifyGeneralTask(transaction, [ownerUserId], actorUserId, {
    type: input.type, taskId: input.taskId, listId: input.listId,
    subtaskId: input.subtaskId ?? null, subjectTitle: input.taskTitle,
    contextTitle: actorName,
  });
}
