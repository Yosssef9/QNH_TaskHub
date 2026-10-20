import { getDatabasePool, sql } from '../../database/sql.js';

export interface DashboardActivity {
  id: number;
  kind: 'TASK' | 'MEETING';
  objectId: number;
  listId: number | null;
  ownerUserId: number | null;
  isShared: boolean;
  title: string;
  actorName: string;
  eventType: string;
  createdAtUtc: string;
}

type ActivityRow = Omit<DashboardActivity,'id'|'objectId'|'createdAtUtc'|'listId'|'ownerUserId'|'isShared'> & {
  id: number | string;
  objectId: number | string;
  listId: number | string | null;
  ownerUserId: number | null;
  isShared: boolean | number;
  createdAtUtc: Date;
};

export const dashboardActivityRepository = {
  async recent(actor:number):Promise<DashboardActivity[]> {
    const pool=await getDatabasePool();
    const result=await pool.request().input('actor',sql.Int,actor).query<ActivityRow>(`
      WITH visibleEvents AS (
        SELECT * FROM (
          SELECT TOP (20) 'TASK' AS kind, activity.id, task.id AS objectId,
          CASE WHEN task.owner_user_id=@actor THEN task.list_id ELSE NULL END AS listId,
          task.owner_user_id AS ownerUserId,
          CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.TM_task_shares shareRow
            WHERE shareRow.task_id=task.id AND shareRow.recipient_user_id=@actor AND shareRow.revoked_at_utc IS NULL)
            THEN 1 ELSE 0 END AS bit) AS isShared,
          task.title, activity.activity_type AS eventType,
          activity.created_at_utc AS createdAtUtc,
          COALESCE(portal.USER_NAME, CONVERT(nvarchar(50),portal.USER_CODE)) AS actorName
        FROM dbo.TM_task_activity activity
        JOIN dbo.TM_tasks task ON task.id=activity.task_id AND task.deleted_at_utc IS NULL
        JOIN dbo.users portal ON portal.USER_ID=activity.actor_user_id
        WHERE task.owner_user_id=@actor
          OR EXISTS (SELECT 1 FROM dbo.TM_meeting_action_items ai
            WHERE ai.task_id=task.id AND ai.assignee_user_id=@actor)
          OR EXISTS (SELECT 1 FROM dbo.TM_collaboration_assignments assignment
            WHERE assignment.task_id=task.id AND assignment.assignee_user_id=@actor AND assignment.is_active=1)
          OR (NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks collab WHERE collab.task_id=task.id)
              AND EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments relation
                WHERE relation.task_id=task.id AND (relation.assignee_user_id=@actor OR EXISTS (
                  SELECT 1 FROM dbo.TM_subtasks child WHERE child.task_id=task.id
                    AND child.deleted_at_utc IS NULL AND
                    COALESCE(child.assignee_user_id,relation.assignee_user_id,task.owner_user_id)=@actor))))
          OR EXISTS (SELECT 1 FROM dbo.TM_task_shares shareRow
            WHERE shareRow.task_id=task.id AND shareRow.recipient_user_id=@actor AND shareRow.revoked_at_utc IS NULL
            AND (NOT EXISTS (SELECT 1 FROM dbo.TM_meeting_action_items ai WHERE ai.task_id=task.id)
              OR EXISTS (SELECT 1 FROM dbo.TM_meeting_action_items ai
                JOIN dbo.TM_meetings meeting ON meeting.id=ai.meeting_id WHERE ai.task_id=task.id
                  AND (meeting.organizer_user_id=@actor OR EXISTS (
                    SELECT 1 FROM dbo.TM_meeting_attendees attendee
                    WHERE attendee.meeting_id=meeting.id AND attendee.attendee_user_id=@actor)))))
          ORDER BY activity.created_at_utc DESC,activity.id DESC
        ) taskEvents
        UNION ALL
        SELECT * FROM (
          SELECT TOP (20) 'MEETING' AS kind, activity.id, meeting.id AS objectId,
          CAST(NULL AS bigint) AS listId,meeting.organizer_user_id AS ownerUserId,
          CAST(0 AS bit) AS isShared,meeting.title,activity.activity_type AS eventType,
          activity.created_at_utc AS createdAtUtc,
          COALESCE(portal.USER_NAME, CONVERT(nvarchar(50),portal.USER_CODE)) AS actorName
        FROM dbo.TM_meeting_activity activity
        JOIN dbo.TM_meetings meeting ON meeting.id=activity.meeting_id
        JOIN dbo.users portal ON portal.USER_ID=activity.actor_user_id
        WHERE meeting.organizer_user_id=@actor OR EXISTS (
          SELECT 1 FROM dbo.TM_meeting_attendees attendee
          WHERE attendee.meeting_id=meeting.id AND attendee.attendee_user_id=@actor)
          ORDER BY activity.created_at_utc DESC,activity.id DESC
        ) meetingEvents
      )
      SELECT TOP (8) kind,id,objectId,listId,ownerUserId,isShared,title,eventType,createdAtUtc,actorName
      FROM visibleEvents ORDER BY createdAtUtc DESC,id DESC;
    `);
    return result.recordset.map(row=>({
      kind:row.kind,id:Number(row.id),objectId:Number(row.objectId),
      listId:row.listId===null?null:Number(row.listId),
      ownerUserId:row.ownerUserId===null?null:Number(row.ownerUserId),isShared:Boolean(row.isShared),title:row.title,
      actorName:row.actorName,eventType:row.eventType,
      createdAtUtc:row.createdAtUtc.toISOString(),
    }));
  },
};
