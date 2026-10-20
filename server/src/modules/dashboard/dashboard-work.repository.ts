import { getDatabasePool, sql } from '../../database/sql.js';
import { getCurrentDateInAppTimeZone } from '../../shared/utils/date.utils.js';
import type { WorkItem, WorkQuery, WorkResponse, WorkSummary } from './dashboard-work.types.js';

/*
 * Each task appears exactly once. Visibility predicates intentionally mirror
 * general-assignments, collaboration, meeting action items and task-shares.
 * Do not join assignment/sharing tables directly: those joins multiply rows
 * and would inflate the dashboard totals.
 */
const scope = `
  SELECT t.id AS taskId, t.owner_user_id AS ownerUserId,
    COALESCE(owner.USER_NAME, CONVERT(nvarchar(50),owner.USER_CODE)) AS ownerName,
    CASE WHEN t.owner_user_id=@actor THEN t.list_id ELSE NULL END AS listId,
    CASE WHEN t.owner_user_id=@actor THEN list.name ELSE NULL END AS listName,
    ma.meeting_id AS meetingId,
    t.title, t.status, t.priority, CONVERT(varchar(10),t.due_date,23) AS dueDate,
    t.due_date AS dueSort, t.created_at_utc AS createdAtUtc,
    recentAssignment.lastAssignedAtUtc,
    visibility.isAssigned, visibility.isShared, visibility.isPersonal, visibility.isDelegated,
    CASE WHEN team.totalAssignments>0 THEN team.totalAssignments
      WHEN EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments g
        WHERE g.task_id=t.id AND g.assignee_user_id IS NOT NULL)
        OR ma.task_id IS NOT NULL THEN 1 ELSE 0 END AS totalAssignments,
    CASE WHEN team.totalAssignments>0 THEN team.completedAssignments
      WHEN t.status='DONE' AND (EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments g
        WHERE g.task_id=t.id AND g.assignee_user_id IS NOT NULL)
        OR ma.task_id IS NOT NULL) THEN 1 ELSE 0 END AS completedAssignments
  FROM dbo.TM_tasks t
  INNER JOIN dbo.users owner ON owner.USER_ID=t.owner_user_id
  LEFT JOIN dbo.TM_lists list ON list.id=t.list_id AND list.owner_user_id=t.owner_user_id
  LEFT JOIN dbo.TM_meeting_action_items ma ON ma.task_id=t.id
  OUTER APPLY (
    SELECT MAX(changedAt) AS lastAssignedAtUtc FROM (VALUES
      ((SELECT MAX(g.assigned_at_utc) FROM dbo.TM_general_task_assignments g
        WHERE g.task_id=t.id AND g.assignee_user_id=@actor)),
      ((SELECT MAX(ca.assigned_at_utc) FROM dbo.TM_collaboration_assignments ca
        WHERE ca.task_id=t.id AND ca.assignee_user_id=@actor AND ca.is_active=1)),
      ((SELECT MAX(m.assigned_at_utc) FROM dbo.TM_meeting_action_items m
        WHERE m.task_id=t.id AND m.assignee_user_id=@actor))
    ) source(changedAt)
  ) recentAssignment
  OUTER APPLY (
    SELECT COUNT_BIG(*) AS totalAssignments,
      COALESCE(SUM(CASE WHEN a.state='DONE' THEN 1 ELSE 0 END),0) AS completedAssignments
    FROM dbo.TM_collaboration_assignments a
    WHERE a.task_id=t.id AND a.subtask_id IS NULL AND a.is_active=1
  ) team
  CROSS APPLY (
    SELECT
      CAST(CASE WHEN t.owner_user_id<>@actor AND
        (EXISTS (SELECT 1 FROM dbo.TM_meeting_action_items m
                  WHERE m.task_id=t.id AND m.assignee_user_id=@actor)
        OR EXISTS (SELECT 1 FROM dbo.TM_collaboration_assignments ca
                   WHERE ca.task_id=t.id AND ca.assignee_user_id=@actor AND ca.is_active=1)
        OR (EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments g WHERE g.task_id=t.id)
            AND NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks ct WHERE ct.task_id=t.id)
            AND EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments g
                        WHERE g.task_id=t.id AND (g.assignee_user_id=@actor OR
                          EXISTS (SELECT 1 FROM dbo.TM_subtasks child
                            WHERE child.task_id=t.id AND child.deleted_at_utc IS NULL
                              AND COALESCE(child.assignee_user_id,g.assignee_user_id,t.owner_user_id)=@actor)))))
        THEN 1 ELSE 0 END AS int) AS isAssigned,
      CAST(CASE WHEN t.owner_user_id<>@actor AND EXISTS (
        SELECT 1 FROM dbo.TM_task_shares sh
        WHERE sh.task_id=t.id AND sh.recipient_user_id=@actor AND sh.revoked_at_utc IS NULL
          AND (ma.task_id IS NULL OR EXISTS (
            SELECT 1 FROM dbo.TM_meetings meeting
            WHERE meeting.id=ma.meeting_id AND
              (meeting.organizer_user_id=@actor OR EXISTS (
                SELECT 1 FROM dbo.TM_meeting_attendees attendee
                WHERE attendee.meeting_id=meeting.id AND attendee.attendee_user_id=@actor)))))
        THEN 1 ELSE 0 END AS int) AS isShared,
      CAST(CASE WHEN t.owner_user_id=@actor AND ma.task_id IS NULL
        THEN 1 ELSE 0 END AS int) AS isPersonal,
      CAST(CASE WHEN t.owner_user_id=@actor AND (
        EXISTS (SELECT 1 FROM dbo.TM_general_task_assignments g
                WHERE g.task_id=t.id AND g.assignee_user_id IS NOT NULL AND g.assignee_user_id<>@actor)
        OR EXISTS (SELECT 1 FROM dbo.TM_collaboration_assignments ca
                   WHERE ca.task_id=t.id AND ca.assignee_user_id<>@actor AND ca.is_active=1)
        OR EXISTS (SELECT 1 FROM dbo.TM_meeting_action_items m
                   WHERE m.task_id=t.id AND m.assignee_user_id<>@actor))
        THEN 1 ELSE 0 END AS int) AS isDelegated
  ) visibility
  WHERE t.deleted_at_utc IS NULL AND t.kpi_instance_id IS NULL
    AND t.list_id IS NOT NULL
    AND (t.owner_user_id=@actor OR visibility.isAssigned=1 OR visibility.isShared=1)
`;

/* Scope is already deduplicated by task identity. */
const totalsSql = `WITH visible AS (${scope})
SELECT
  COALESCE(SUM(CASE WHEN isAssigned=1 AND status IN ('TODO','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS assigned,
  COALESCE(SUM(CASE WHEN isShared=1 AND status IN ('TODO','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS shared,
  COALESCE(SUM(CASE WHEN isPersonal=1 AND status IN ('TODO','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS personal,
  COALESCE(SUM(CASE WHEN isDelegated=1 AND status IN ('TODO','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS delegated,
  COALESCE(SUM(CASE WHEN status IN ('TODO','IN_PROGRESS') AND
    (dueSort<=@today OR priority='HIGH' OR (isAssigned=1 AND lastAssignedAtUtc>=DATEADD(DAY,-7,SYSUTCDATETIME()))) THEN 1 ELSE 0 END),0) AS attention,
  COALESCE(SUM(CASE WHEN dueSort=@today AND status IN ('TODO','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS dueToday,
  COALESCE(SUM(CASE WHEN dueSort<@today AND status IN ('TODO','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS overdue
FROM visible;`;

// Tab and ordering are selected exclusively from closed server-side maps.
const tabConditions: Record<WorkQuery['tab'], string> = {
  attention: "status IN ('TODO','IN_PROGRESS') AND (dueSort<=@today OR priority='HIGH' OR (isAssigned=1 AND lastAssignedAtUtc>=DATEADD(DAY,-7,SYSUTCDATETIME())))",
  assigned: 'isAssigned=1',
  shared: 'isShared=1',
  personal: 'isPersonal=1',
  delegated: 'isDelegated=1',
};

interface ItemRow extends Omit<WorkItem,'createdAtUtc'|'isAssigned'|'isShared'|'isPersonal'|'isDelegated'> {
  createdAtUtc: Date;
  isAssigned: number;
  isShared: number;
  isPersonal: number;
  isDelegated: number;
  total: number | string;
}

export const dashboardWorkRepository = {
  async list(actor: number, query: WorkQuery): Promise<WorkResponse> {
    const pool = await getDatabasePool();
    const today = getCurrentDateInAppTimeZone();
    const totalRequest = pool.request().input('actor',sql.Int,actor).input('today',sql.Date,today);
    const summaryResult = await totalRequest.query<WorkSummary>(totalsSql);
    const summary = summaryResult.recordset[0];
    const normalizedSummary: WorkSummary = {
      assigned:Number(summary?.assigned??0),shared:Number(summary?.shared??0),
      personal:Number(summary?.personal??0),delegated:Number(summary?.delegated??0),
      attention:Number(summary?.attention??0),dueToday:Number(summary?.dueToday??0),
      overdue:Number(summary?.overdue??0),
    };
    const escaped = query.search.replace(/\[/g,'[[]').replace(/%/g,'[%]').replace(/_/g,'[_]');
    const filter = `${tabConditions[query.tab]}
      AND (@search='' OR title LIKE @pattern OR ownerName LIKE @pattern OR listName LIKE @pattern)
      AND ((@status='ACTIVE' AND status IN ('TODO','IN_PROGRESS')) OR @status='ALL' OR status=@status)
      AND (@priority='ALL' OR priority=@priority)
      AND (@due='ALL' OR (@due='OVERDUE' AND dueSort<@today AND status IN ('TODO','IN_PROGRESS'))
        OR (@due='TODAY' AND dueSort=@today)
        OR (@due='UPCOMING' AND dueSort>@today)
        OR (@due='NO_DATE' AND dueSort IS NULL))`;
    const sortOrder: Record<WorkQuery['sort'], string> = {
      urgency: `CASE WHEN dueSort<@today AND status IN ('TODO','IN_PROGRESS') THEN 0
        WHEN dueSort=@today AND status IN ('TODO','IN_PROGRESS') THEN 1 ELSE 2 END,
        CASE priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
        CASE WHEN dueSort IS NULL THEN 1 ELSE 0 END, dueSort, createdAtUtc DESC`,
      created: 'createdAtUtc DESC',
      due: 'CASE WHEN dueSort IS NULL THEN 1 ELSE 0 END, dueSort ASC',
      priority: "CASE priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, dueSort ASC",
    };
    const request = pool.request().input('actor',sql.Int,actor).input('today',sql.Date,today)
      .input('search',sql.NVarChar(120),query.search).input('pattern',sql.NVarChar(250),`%${escaped}%`)
      .input('status',sql.VarChar(20),query.status).input('priority',sql.VarChar(10),query.priority)
      .input('due',sql.VarChar(10),query.due)
      .input('offset',sql.Int,(query.page-1)*query.pageSize).input('pageSize',sql.Int,query.pageSize);
    const result = await request.query<ItemRow>(`
      WITH visible AS (${scope}), filtered AS (SELECT * FROM visible WHERE ${filter})
      SELECT taskId,ownerUserId,ownerName,listId,listName,meetingId,title,status,priority,
        dueDate,createdAtUtc,isAssigned,isShared,isPersonal,isDelegated,totalAssignments,completedAssignments,
        COUNT_BIG(*) OVER() AS total
      FROM filtered
      ORDER BY ${sortOrder[query.sort]}, taskId DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
    return {
      summary:normalizedSummary,
      items:result.recordset.map(row=>({
        taskId:Number(row.taskId),ownerUserId:Number(row.ownerUserId),ownerName:row.ownerName,
        listId:row.listId===null?null:Number(row.listId),listName:row.listName,
        meetingId:row.meetingId===null?null:Number(row.meetingId),
        title:row.title,status:row.status,priority:row.priority,dueDate:row.dueDate,
        createdAtUtc:row.createdAtUtc.toISOString(),isAssigned:Boolean(row.isAssigned),
        isShared:Boolean(row.isShared),isPersonal:Boolean(row.isPersonal),isDelegated:Boolean(row.isDelegated),
        totalAssignments:Number(row.totalAssignments),completedAssignments:Number(row.completedAssignments),
      })),page:query.page,pageSize:query.pageSize,total:Number(result.recordset[0]?.total??0),
    };
  },
};
