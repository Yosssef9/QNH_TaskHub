import type { DatabaseTransaction } from "../../database/types.js";
import { meetingActionItemsRepository } from "../meeting-action-items/meeting-action-items.repository.js";
import { meetingSchedulingRepository } from "../meetings/meeting-scheduling.repository.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { tasksRepository } from "../tasks/tasks.repository.js";
import type { TaskRecord } from "../tasks/tasks.types.js";
import { generalTaskAssignmentsRepository, setAutoParentStatus } from "./general-task-assignments.repository.js";

/** Called with the parent row locked within the same transaction as the subtask write. */
export async function reconcileParentCompletion(transaction: DatabaseTransaction,
  task: TaskRecord, ownerUserId: number, taskId: number, actorUserId: number): Promise<void> {
  if (task.kpiInstanceId !== null || task.status === "CANCELLED") return;
  const { total, incomplete } = await generalTaskAssignmentsRepository.countIncompleteSubtasks(
    transaction, taskId, ownerUserId);
  const shouldComplete = total > 0 && incomplete === 0;
  if (shouldComplete && task.status !== "DONE") {
    await setAutoParentStatus(transaction, ownerUserId, taskId, "DONE");
    await tasksRepository.addActivity(transaction, ownerUserId, taskId, "STATUS_CHANGED",
      {from:task.status,to:"DONE",automatic:true,completedSubtasks:total},actorUserId);
    const meeting = await meetingActionItemsRepository.findContext(taskId, transaction);
    if (meeting) {
      await meetingSchedulingRepository.addActivity(transaction, meeting.meetingId, actorUserId,
        "ACTION_ITEM_STATUS_CHANGED", {taskId,taskTitle:task.title,
        fromTaskStatus:task.status,toTaskStatus:"DONE",automatic:true});
      if (actorUserId !== ownerUserId) {
        await notificationsRepository.ensureMeetingActionItemNotification(ownerUserId, {
          type:"MEETING_ACTION_ITEM_COMPLETED",taskId,listId:task.listId,
          meetingId:meeting.meetingId,subjectTitle:task.title,
          contextTitle:meeting.meetingTitle,
          dedupeKey:`MEETING_ACTION_ITEM_COMPLETED:AUTO:${taskId}:${Date.now()}`,
        },transaction);
      }
    } else {
      const general = await generalTaskAssignmentsRepository.findContext(taskId, transaction);
      if (general) {
        const recipients=new Set([ownerUserId,general.assigneeUserId].filter(
          (id):id is number => id!==null && id!==actorUserId));
        for (const recipient of recipients) {
          await notificationsRepository.ensureGeneralTaskNotification(recipient, {
            type:"GENERAL_TASK_COMPLETED",taskId,listId:task.listId,
            subjectTitle:task.title,contextTitle:"All subtasks completed",
            dedupeKey:`GENERAL_TASK_COMPLETED:${taskId}:${recipient}:${Date.now()}`,
          },transaction);
        }
      }
    }
  } else if (!shouldComplete && task.status === "DONE" && task.autoCompletedFromSubtasks) {
    await setAutoParentStatus(transaction, ownerUserId, taskId, "IN_PROGRESS");
    await tasksRepository.addActivity(transaction, ownerUserId, taskId, "STATUS_CHANGED",
      {from:"DONE",to:"IN_PROGRESS",automatic:true},actorUserId);
  }
}
