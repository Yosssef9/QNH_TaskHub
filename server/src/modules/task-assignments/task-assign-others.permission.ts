import { getDatabasePool, sql } from '../../database/sql.js';
import type { DatabaseTransaction } from '../../database/types.js';
import { AppError } from '../../shared/errors/app-error.js';

export const taskAssignmentPermissionError = () => new AppError({
  statusCode: 403,
  code: 'TASK_ASSIGN_OTHERS_REQUIRED',
  message: 'You do not have permission to assign tasks to other employees. Contact your TaskHub administrator.',
});

/** Any change involving another employee requires the Admin-granted permission.
 * Self-only private work does not. Meeting Action Items and proxy management
 * are intentionally checked by their existing, separate policies.
 */
export async function assertMayAssignOthers(
  actorId: number,
  affectedUserIds: readonly (number | null | undefined)[],
  transaction?: DatabaseTransaction,
): Promise<void> {
  if (!affectedUserIds.some(id => id != null && id !== actorId)) return;
  const connection = transaction ?? await getDatabasePool();
  const result = await connection.request().input('actorId', sql.Int, actorId).query<{ allowed: number }>(`
    SELECT CAST(CASE WHEN EXISTS (
      SELECT 1 FROM dbo.TM_user_access AS access WITH (UPDLOCK, HOLDLOCK)
      JOIN dbo.users AS portal ON portal.USER_ID = access.portal_user_id
      WHERE access.portal_user_id = @actorId AND access.is_active = 1 AND portal.IS_ACTIVE = 1
        AND (access.role_code = 'ADMIN' OR EXISTS (
          SELECT 1 FROM dbo.TM_access_permissions AS p WITH (UPDLOCK, HOLDLOCK)
          WHERE p.grantee_user_id = @actorId AND p.module_code = 'TASK_MANAGEMENT'
            AND p.entity_code = 'TASK_ASSIGNMENTS' AND p.permission_code = 'TASK_ASSIGN_OTHERS'
            AND p.resource_owner_user_id IS NULL AND p.is_active = 1
        ))
    ) THEN 1 ELSE 0 END AS BIT) AS allowed;
  `);
  if (!result.recordset[0]?.allowed) throw taskAssignmentPermissionError();
}
