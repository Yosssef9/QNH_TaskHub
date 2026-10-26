import { getDatabasePool, sql } from '../../database/sql.js';
import { assertDiscussionAccess } from '../task-discussions/task-discussions.policy.js';
import type { NotificationRecord } from './notifications.repository.js';
import type { DiscussionNotificationDetails } from './notifications.types.js';

export function isDiscussionNotification(record: Pick<NotificationRecord, 'notificationType'>): boolean {
  return record.notificationType === 'TASK_DISCUSSION_MESSAGE' || record.notificationType === 'TASK_DISCUSSION_MENTION';
}

/** The stored key has always identified the original message (including edited mentions). */
export function discussionMessageId(key: string | null | undefined): number | null {
  const match = /^(?:TASK_DISCUSSION|TASK_DISCUSSION_EDIT):([1-9][0-9]*):[1-9][0-9]*$/.exec(key ?? '');
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

interface MessageContextRow {
  messageId: number | string;
  taskId: number | string;
  subtaskId: number | string | null;
  deletedAtUtc: Date | null;
  body: string | null;
  authorUserId: number;
  senderName: string | null;
  senderCode: string | null;
  taskTitle: string;
  subtaskTitle: string | null;
  hasAttachment: boolean | number;
}

/**
 * Data is retrieved at read time, not copied into notification records.
 * Verify the recipient's CURRENT access to the exact task/subtask before returning
 * ANY private message, sender, title, or attachment details.
 */
export async function getDiscussionNotificationDetails(
  viewerId: number,
  records: NotificationRecord[],
): Promise<Map<number, DiscussionNotificationDetails>> {
  const targets = records.filter(isDiscussionNotification);
  const details = new Map<number, DiscussionNotificationDetails>();
  if (targets.length === 0) return details;

  const unavailable: DiscussionNotificationDetails = { status: 'unavailable' };
  const ids = [...new Set(targets.map((record) => discussionMessageId(record.dedupeKey)).filter((id): id is number => id !== null))];
  if (!ids.length) {
    for (const notification of targets) details.set(Number(notification.id), unavailable);
    return details;
  }

  const pool = await getDatabasePool();
  const query = await pool.request()
    .input('messageIds', sql.NVarChar(sql.MAX), ids.join(','))
    .query<MessageContextRow>(`
      SELECT m.id AS messageId, m.task_id AS taskId, m.subtask_id AS subtaskId,
        m.deleted_at_utc AS deletedAtUtc, m.body,
        m.author_user_id AS authorUserId,
        NULLIF(LTRIM(RTRIM(author.USER_NAME)), N'') AS senderName,
        CONVERT(NVARCHAR(100), author.USER_CODE) AS senderCode,
        task.title AS taskTitle, child.title AS subtaskTitle,
        CAST(CASE WHEN EXISTS (
          SELECT 1 FROM dbo.TM_task_discussion_files f
          WHERE f.message_id = m.id AND f.deleted_at_utc IS NULL
        ) THEN 1 ELSE 0 END AS BIT) AS hasAttachment
      FROM dbo.TM_task_discussion_messages m
      JOIN dbo.TM_tasks task ON task.id = m.task_id AND task.deleted_at_utc IS NULL
      LEFT JOIN dbo.TM_subtasks child ON child.id = m.subtask_id AND child.task_id = m.task_id
      LEFT JOIN dbo.users author ON author.USER_ID = m.author_user_id
      WHERE m.id IN (
        SELECT TRY_CONVERT(BIGINT, value) FROM STRING_SPLIT(@messageIds, ',')
      );
    `);

  const byId = new Map<number, MessageContextRow>(query.recordset.map((row) => [Number(row.messageId), row]));
  const accessByScope = new Map<string, boolean>();

  for (const notification of targets) {
    const messageId = discussionMessageId(notification.dedupeKey);
    const message = messageId === null ? undefined : byId.get(messageId);
    const scopeTaskId = Number(notification.taskId);
    const scopeSubtaskId = notification.subtaskId == null ? null : Number(notification.subtaskId);
    if (!message || !Number.isSafeInteger(scopeTaskId) || scopeTaskId <= 0 ||
      Number(message.taskId) !== scopeTaskId ||
      (message.subtaskId == null ? null : Number(message.subtaskId)) !== scopeSubtaskId ||
      viewerId === Number(message.authorUserId)) {
      details.set(Number(notification.id), unavailable);
      continue;
    }

    const scopeKey = `${scopeTaskId}:${scopeSubtaskId ?? 'main'}`;
    if (!accessByScope.has(scopeKey)) {
      try {
        await assertDiscussionAccess(viewerId, { taskId: scopeTaskId, subtaskId: scopeSubtaskId });
        accessByScope.set(scopeKey, true);
      } catch {
        accessByScope.set(scopeKey, false);
      }
    }
    if (!accessByScope.get(scopeKey)) {
      details.set(Number(notification.id), unavailable);
      continue;
    }

    if (message.deletedAtUtc) {
      details.set(Number(notification.id), {
        status: 'deleted', messageId,
        taskTitle: message.taskTitle,
        subtaskTitle: message.subtaskTitle,
      });
      continue;
    }

    const body = (message.body ?? '').replace(/\s+/gu, ' ').trim();
    details.set(Number(notification.id), {
      status: 'active', messageId,
      taskTitle: message.taskTitle,
      subtaskTitle: message.subtaskTitle,
      senderName: message.senderName || message.senderCode || null,
      senderCode: message.senderCode,
      preview: body ? body.slice(0, 280) : null,
      hasAttachment: Boolean(message.hasAttachment),
    });
  }
  return details;
}
