/** Distinct actively assigned users across main task and non-deleted subtasks.
 * Legacy tasks can have distinct subtask assignees without collaboration rows.
 * No private per-user work data is projected by this expression.
 */
export const distinctTaskAssigneeCountSql = `(
  SELECT COUNT(DISTINCT members.userId)
  FROM (
    SELECT a.assignee_user_id AS userId
    FROM dbo.TM_collaboration_assignments AS a
    WHERE a.task_id = task.id AND a.is_active = 1
      AND (a.subtask_id IS NULL OR EXISTS (
        SELECT 1 FROM dbo.TM_subtasks s
        WHERE s.id = a.subtask_id AND s.task_id = task.id AND s.deleted_at_utc IS NULL
      ))
    UNION ALL
    SELECT ga.assignee_user_id
    FROM dbo.TM_general_task_assignments ga
    WHERE ga.task_id = task.id AND ga.assignee_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id = task.id)
    UNION ALL
    SELECT ma.assignee_user_id
    FROM dbo.TM_meeting_action_items ma
    WHERE ma.task_id = task.id
      AND NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id = task.id)
    UNION ALL
    SELECT s.assignee_user_id
    FROM dbo.TM_subtasks s
    WHERE s.task_id = task.id AND s.deleted_at_utc IS NULL AND s.assignee_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id = task.id)
  ) members
)`;

export const taskTypeConditionSql = `(
  @taskType = 'ALL'
  OR (@taskType = 'TEAM' AND ${distinctTaskAssigneeCountSql} > 1)
  OR (@taskType = 'SINGLE' AND ${distinctTaskAssigneeCountSql} = 1)
  OR (@taskType = 'PERSONAL' AND ${distinctTaskAssigneeCountSql} = 0)
)`;

/**
 * Read-only task-card projection. Never include individual work entries, file IDs,
 * individual completion states or private subtask titles in list responses.
 * All callers must first restrict the underlying task rows to an authorized scope.
 */
export const collaborationCardSummarySql = `
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks AS collaboration
    WHERE collaboration.task_id = task.id) THEN 1 ELSE 0 END AS bit) AS collaborationEnabled,
  CAST(CASE WHEN ${distinctTaskAssigneeCountSql} > 1 THEN 1 ELSE 0 END AS bit) AS teamTask,
  ${distinctTaskAssigneeCountSql} AS teamMemberCount,
  (SELECT COUNT(*) FROM dbo.TM_collaboration_assignments AS member
   WHERE member.task_id = task.id AND member.subtask_id IS NULL AND member.is_active = 1) AS mainAssigneeCount,
  (SELECT COUNT(*) FROM dbo.TM_collaboration_assignments AS member
   WHERE member.task_id = task.id AND member.subtask_id IS NULL
     AND member.is_active = 1 AND member.state = 'DONE') AS mainCompletedCount,
  (SELECT member.userId, COALESCE(portal.USER_NAME, portal.USER_CODE) AS userName,
      portal.USER_CODE AS userCode, portal.email,
      CAST(member.mainAssignee AS bit) AS mainAssignee
   FROM (
     SELECT members.userId, MAX(members.mainAssignee) AS mainAssignee
     FROM (
     SELECT ca.assignee_user_id AS userId,
       MAX(CASE WHEN ca.subtask_id IS NULL THEN 1 ELSE 0 END) AS mainAssignee
     FROM dbo.TM_collaboration_assignments AS ca
     WHERE ca.task_id = task.id AND ca.is_active = 1
       AND (ca.subtask_id IS NULL OR EXISTS (
         SELECT 1 FROM dbo.TM_subtasks s
         WHERE s.id = ca.subtask_id AND s.task_id = task.id AND s.deleted_at_utc IS NULL))
     GROUP BY ca.assignee_user_id
     UNION ALL
     SELECT ga.assignee_user_id, 1
     FROM dbo.TM_general_task_assignments AS ga
     WHERE ga.task_id = task.id AND ga.assignee_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks AS ct WHERE ct.task_id = task.id)
     UNION ALL
     SELECT ma.assignee_user_id, 1
     FROM dbo.TM_meeting_action_items AS ma
     WHERE ma.task_id = task.id
       AND NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks AS ct WHERE ct.task_id = task.id)
     UNION ALL
     SELECT s.assignee_user_id, 0
     FROM dbo.TM_subtasks s
     WHERE s.task_id = task.id AND s.deleted_at_utc IS NULL AND s.assignee_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.TM_collaboration_tasks AS ct WHERE ct.task_id = task.id)
     ) AS members
     GROUP BY members.userId
   ) AS member
   INNER JOIN dbo.users AS portal ON portal.USER_ID = member.userId
   ORDER BY member.mainAssignee DESC, portal.USER_NAME, portal.USER_CODE, member.userId
   FOR JSON PATH, INCLUDE_NULL_VALUES) AS teamRosterJson`;

