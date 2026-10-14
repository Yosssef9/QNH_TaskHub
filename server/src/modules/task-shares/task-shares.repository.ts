import { getDatabasePool,sql } from '../../database/sql.js';
import type { DatabaseTransaction } from '../../database/types.js';

export type SharePermission = 'VIEW'|'EDIT';
export interface ShareGrant { permission:SharePermission; ownerUserId:number; updatedAtUtc:Date }
export const taskSharesRepository = {
 async grant(taskId:number,actorId:number,tx?:DatabaseTransaction):Promise<ShareGrant|null> {
  const q=(tx?tx.request():(await getDatabasePool()).request()).input('taskId',sql.BigInt,taskId).input('actor',sql.Int,actorId);
  const result=await q.query<{permission:SharePermission;ownerUserId:number;updatedAtUtc:Date}>(`
    SELECT TOP (1) s.permission_code AS permission,t.owner_user_id AS ownerUserId,s.updated_at_utc AS updatedAtUtc
    FROM dbo.TM_task_shares s JOIN dbo.TM_tasks t ON t.id=s.task_id AND t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL
    JOIN dbo.TM_user_access acc ON acc.portal_user_id=s.recipient_user_id AND acc.is_active=1
    JOIN dbo.users usr ON usr.USER_ID=s.recipient_user_id AND usr.IS_ACTIVE=1
    WHERE s.task_id=@taskId AND s.recipient_user_id=@actor AND s.revoked_at_utc IS NULL
      AND (NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma WHERE ma.task_id=s.task_id)
       OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items ma JOIN dbo.TM_meetings m ON m.id=ma.meeting_id
         WHERE ma.task_id=s.task_id AND (m.organizer_user_id=@actor OR EXISTS(
           SELECT 1 FROM dbo.TM_meeting_attendees a WHERE a.meeting_id=m.id AND a.attendee_user_id=@actor))))`);
  return result.recordset[0]??null;
 },
};
