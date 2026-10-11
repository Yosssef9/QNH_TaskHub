import { randomUUID } from "node:crypto";
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
