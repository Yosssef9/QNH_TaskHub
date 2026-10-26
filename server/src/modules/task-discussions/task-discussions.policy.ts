import { getDatabasePool, sql } from '../../database/sql.js';
import { resolveTaskAccess } from '../meeting-action-items/meeting-action-items.access.js';
import { AppError } from '../../shared/errors/app-error.js';

export type DiscussionScope = { taskId: number; subtaskId: number | null };

/** Independent of task sharing. Private work, inactive memberships and child-only users cannot escape their scope. */
export async function assertDiscussionAccess(userId: number, scope: DiscussionScope, write = false): Promise<void> {
  const access = await resolveTaskAccess(userId, scope.taskId);
  if (!access || access.sharedPermission && access.capabilities.role === 'VIEWER' && userId !== access.ownerUserId) {
    throw denied();
  }
  const pool = await getDatabasePool();
  const result = await pool.request()
    .input('taskId', sql.BigInt, scope.taskId)
    .input('subtaskId', sql.BigInt, scope.subtaskId)
    .input('userId', sql.Int, userId)
    .query<{ownerId: number; status: string; kpi: number | null; childExists: number; member: number}>(`
      SELECT t.owner_user_id AS ownerId,t.status,t.kpi_instance_id AS kpi,
        CAST(CASE WHEN @subtaskId IS NULL OR EXISTS(
          SELECT 1 FROM dbo.TM_subtasks st
          WHERE st.task_id=t.id AND st.id=@subtaskId AND st.deleted_at_utc IS NULL) THEN 1 ELSE 0 END AS int) AS childExists,
        CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
          THEN CASE WHEN EXISTS(SELECT 1 FROM dbo.TM_collaboration_assignments a
              WHERE a.task_id=t.id AND a.assignee_user_id=@userId AND a.is_active=1
                AND ((@subtaskId IS NULL AND a.subtask_id IS NULL)
                  OR (@subtaskId IS NOT NULL AND a.subtask_id=@subtaskId))) THEN 1 ELSE 0 END
          WHEN @subtaskId IS NULL THEN CASE WHEN EXISTS(
              SELECT 1 FROM dbo.TM_general_task_assignments g
                WHERE g.task_id=t.id AND g.assignee_user_id=@userId)
              OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items mi
                WHERE mi.task_id=t.id AND mi.assignee_user_id=@userId) THEN 1 ELSE 0 END
          ELSE CASE WHEN EXISTS(
              SELECT 1 FROM dbo.TM_subtasks st
              LEFT JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
              LEFT JOIN dbo.TM_meeting_action_items mi ON mi.task_id=t.id
              WHERE st.id=@subtaskId AND st.task_id=t.id AND st.deleted_at_utc IS NULL
                AND COALESCE(st.assignee_user_id,g.assignee_user_id,mi.assignee_user_id)=@userId
            ) THEN 1 ELSE 0 END END AS int) AS member
      FROM dbo.TM_tasks t WHERE t.id=@taskId AND t.deleted_at_utc IS NULL;
    `);
  const row = result.recordset[0];
  if (!row || row.kpi !== null || row.childExists !== 1) throw denied();
  if (userId !== Number(row.ownerId) && row.member !== 1) throw denied();
  if (write && row.status === 'CANCELLED') throw new AppError({statusCode:409, code:'DISCUSSION_CLOSED',message:'Discussion is read-only on a cancelled task.'});
}

function denied(): AppError {
  return new AppError({statusCode:404,code:'DISCUSSION_NOT_FOUND',message:'Discussion unavailable.'});
}

/** Every uploaded discussion file belongs to its message author. A deleted message
 * cannot be used to reactivate or mutate evidence through a saved file URL. */
export function canDeleteDiscussionAttachment(actorId:number, file:{
  authorUserId:number;messageDeletedAtUtc:Date|null;
}):boolean {
  return actorId===file.authorUserId && file.messageDeletedAtUtc===null;
}
