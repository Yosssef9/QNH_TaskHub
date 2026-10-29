import { getDatabasePool, sql } from '../../database/sql.js';
import type { DatabaseTransaction } from '../../database/types.js';
import { recoverAttachmentFileName } from '../../shared/utils/attachment-filename.js';

export interface CollaborativeTaskRow {
  taskId: number;
  ownerUserId: number;
  title: string;
  listId:number|null;
  meetingTitle:string|null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  kpiInstanceId: number | null;
  meetingId: number | null;
  meetingOrganizerUserId: number | null;
  oldMainAssigneeUserId: number | null;
  isCollaborative: boolean;
}
export interface CollaborativeAssignmentRow {
  id: number;
  taskId: number;
  subtaskId: number | null;
  assigneeUserId: number;
  proxyUserId: number | null;
  state: 'TODO' | 'IN_PROGRESS' | 'DONE';
  isActive: boolean;
  assignmentOrigin: 'EXPLICIT' | 'INHERITED';
  completedAtUtc: Date | null;
  assignedAtUtc: Date;
}

function requestFor(transaction?: DatabaseTransaction) {
  return transaction ? transaction.request() : getDatabasePool().then(pool => pool.request());
}
export const collaborationRepository = {
  async task(taskId: number, transaction?: DatabaseTransaction): Promise<CollaborativeTaskRow | null> {
    const request = await requestFor(transaction);
    const result = await request.input('taskId', sql.BigInt, taskId).query<CollaborativeTaskRow>(`
      SELECT task.id AS taskId, task.owner_user_id AS ownerUserId,
        task.title,task.list_id AS listId,task.status,task.kpi_instance_id AS kpiInstanceId,
        meetingOwner.title AS meetingTitle,
        meeting.meeting_id AS meetingId,
        meetingOwner.organizer_user_id AS meetingOrganizerUserId,
        COALESCE(meeting.assignee_user_id, general.assignee_user_id) AS oldMainAssigneeUserId,
        CAST(CASE WHEN collaboration.task_id IS NULL THEN 0 ELSE 1 END AS bit) AS isCollaborative
      FROM dbo.TM_tasks task
      LEFT JOIN dbo.TM_meeting_action_items meeting ON meeting.task_id=task.id
      LEFT JOIN dbo.TM_meetings meetingOwner ON meetingOwner.id=meeting.meeting_id
      LEFT JOIN dbo.TM_general_task_assignments general ON general.task_id=task.id
      LEFT JOIN dbo.TM_collaboration_tasks collaboration ON collaboration.task_id=task.id
      WHERE task.id=@taskId AND task.deleted_at_utc IS NULL;
    `);
    const row = result.recordset[0];
    return row ? {...row, taskId:Number(row.taskId), ownerUserId:Number(row.ownerUserId),
      meetingId:row.meetingId===null?null:Number(row.meetingId),
      isCollaborative:Boolean(row.isCollaborative)} : null;
  },
  async active(taskId: number, transaction?: DatabaseTransaction): Promise<boolean> {
    const request=await requestFor(transaction);
    const result=await request.input('taskId',sql.BigInt,taskId).query<{id:number}>(`
      SELECT TOP(1) 1 id FROM dbo.TM_collaboration_tasks WHERE task_id=@taskId;`);
    return Boolean(result.recordset[0]);
  },
  async activeAssignments(taskId: number, transaction?: DatabaseTransaction): Promise<CollaborativeAssignmentRow[]> {
    const request=await requestFor(transaction);
    const result=await request.input('taskId',sql.BigInt,taskId).query<CollaborativeAssignmentRow>(`
      SELECT id,task_id AS taskId,subtask_id AS subtaskId,assignee_user_id AS assigneeUserId,
        proxy_user_id AS proxyUserId,state,is_active AS isActive,assignment_origin AS assignmentOrigin,
        completed_at_utc AS completedAtUtc,assigned_at_utc AS assignedAtUtc
      FROM dbo.TM_collaboration_assignments
      WHERE task_id=@taskId AND is_active=1 ORDER BY subtask_id,assignee_user_id;`);
    return result.recordset.map(row=>({...row,id:Number(row.id),taskId:Number(row.taskId),
      subtaskId:row.subtaskId===null?null:Number(row.subtaskId), isActive:Boolean(row.isActive)}));
  },
  async visibleChildIds(taskId:number,actorId:number,transaction?:DatabaseTransaction):Promise<number[]> {
    const request=await requestFor(transaction);
    const result=await request.input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId)
      .query<{id:number|string}>(`SELECT DISTINCT subtask_id id FROM dbo.TM_collaboration_assignments
        WHERE task_id=@taskId AND (assignee_user_id=@actorId OR proxy_user_id=@actorId)
          AND is_active=1 AND subtask_id IS NOT NULL;`);
    return result.recordset.map(row=>Number(row.id));
  },
  async isAssigned(taskId:number,actorId:number,transaction?:DatabaseTransaction):Promise<boolean> {
    const request=await requestFor(transaction);
    const result=await request.input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId)
      .query<{id:number}>(`SELECT TOP(1) 1 id FROM dbo.TM_collaboration_assignments assignee
        JOIN dbo.TM_user_access access ON access.portal_user_id=assignee.assignee_user_id AND access.is_active=1
        JOIN dbo.users portal ON portal.USER_ID=assignee.assignee_user_id AND portal.IS_ACTIVE=1
        WHERE assignee.task_id=@taskId AND (assignee.assignee_user_id=@actorId OR
            (assignee.proxy_user_id=@actorId AND NOT EXISTS(
              SELECT 1 FROM dbo.TM_meeting_action_items mi WHERE mi.task_id=assignee.task_id)))
          AND assignee.is_active=1
          AND (NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items mi WHERE mi.task_id=assignee.task_id)
            OR EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items mi
              JOIN dbo.TM_meeting_attendees att ON att.meeting_id=mi.meeting_id
                AND att.attendee_user_id=@actorId
              WHERE mi.task_id=assignee.task_id));`);
    return Boolean(result.recordset[0]);
  },
  async assignment(assignmentId:number,transaction?:DatabaseTransaction):Promise<CollaborativeAssignmentRow|null> {
    const request=await requestFor(transaction);
    const result=await request.input('assignmentId',sql.BigInt,assignmentId).query<CollaborativeAssignmentRow>(`
      SELECT id,task_id AS taskId,subtask_id AS subtaskId,assignee_user_id AS assigneeUserId,
        proxy_user_id AS proxyUserId,state,is_active AS isActive,assignment_origin AS assignmentOrigin,
        completed_at_utc AS completedAtUtc,assigned_at_utc AS assignedAtUtc
      FROM dbo.TM_collaboration_assignments WHERE id=@assignmentId;`);
    const r=result.recordset[0];return r?{...r,id:Number(r.id),taskId:Number(r.taskId),
      subtaskId:r.subtaskId===null?null:Number(r.subtaskId),isActive:Boolean(r.isActive)}:null;
  },
  async setProxy(assignmentId:number,principalId:number,proxyId:number|null,
      transaction:DatabaseTransaction):Promise<boolean>{
    const current=await transaction.request().input('assignmentId',sql.BigInt,assignmentId)
      .input('principalId',sql.Int,principalId).query<{proxyUserId:number|null}>(`
      SELECT proxy_user_id AS proxyUserId FROM dbo.TM_collaboration_assignments WITH(UPDLOCK,HOLDLOCK)
      WHERE id=@assignmentId AND assignee_user_id=@principalId AND is_active=1;`);
    if(!current.recordset.length) return false;
    if((current.recordset[0]!.proxyUserId??null)===proxyId)return false;
    await transaction.request().input('assignmentId',sql.BigInt,assignmentId)
      .input('proxyId',sql.Int,proxyId).query(`UPDATE dbo.TM_collaboration_assignments
      SET proxy_user_id=@proxyId,proxy_assigned_at_utc=CASE WHEN @proxyId IS NULL
        THEN NULL ELSE SYSUTCDATETIME() END WHERE id=@assignmentId AND is_active=1;`);
    return true;
  },
  async activeUser(userId:number,transaction:DatabaseTransaction):Promise<boolean>{
    const result=await transaction.request().input('userId',sql.Int,userId).query<{id:number}>(`
      SELECT TOP(1) 1 id FROM dbo.TM_user_access a JOIN dbo.users p ON p.USER_ID=a.portal_user_id
      WHERE a.portal_user_id=@userId AND a.is_active=1 AND p.IS_ACTIVE=1;`);
    return Boolean(result.recordset[0]);
  },
  async meetingEligible(userId:number,meetingId:number,organizerId:number,transaction:DatabaseTransaction):Promise<boolean>{
    const result=await transaction.request().input('userId',sql.Int,userId)
      .input('meetingId',sql.BigInt,meetingId).input('organizerId',sql.Int,organizerId)
      .query<{id:number}>(`SELECT TOP(1) 1 id FROM dbo.TM_meeting_attendees attendee
        JOIN dbo.TM_user_access access ON access.portal_user_id=attendee.attendee_user_id AND access.is_active=1
        JOIN dbo.users portal ON portal.USER_ID=access.portal_user_id AND portal.IS_ACTIVE=1
        WHERE attendee.meeting_id=@meetingId AND attendee.attendee_user_id=@userId
          AND attendee.attendee_user_id<>@organizerId;`);
    return Boolean(result.recordset[0]);
  },
  async activate(taskId:number,ownerId:number,transaction:DatabaseTransaction):Promise<void>{
    await transaction.request().input('taskId',sql.BigInt,taskId).input('ownerId',sql.Int,ownerId)
      .query(`INSERT INTO dbo.TM_collaboration_tasks(task_id,owner_user_id,activated_by_user_id)
        VALUES(@taskId,@ownerId,@ownerId);`);
  },
  async childModes(taskId:number,transaction:DatabaseTransaction):Promise<Array<{subtaskId:number;mode:'INHERIT'|'CUSTOM'; legacyAssigneeUserId:number|null;isCompleted:boolean}>> {
    const result=await transaction.request().input('taskId',sql.BigInt,taskId).query<{
      subtaskId:number;mode:'INHERIT'|'CUSTOM';legacyAssigneeUserId:number|null;isCompleted:boolean
    }>(`SELECT child.id AS subtaskId,mode.assignment_mode AS mode,
      child.assignee_user_id AS legacyAssigneeUserId,child.is_completed AS isCompleted
      FROM dbo.TM_subtasks child JOIN dbo.TM_collaboration_subtask_modes mode ON mode.subtask_id=child.id
      WHERE child.task_id=@taskId AND child.deleted_at_utc IS NULL ORDER BY child.id;`);
    return result.recordset.map(row=>({...row,subtaskId:Number(row.subtaskId),isCompleted:Boolean(row.isCompleted)}));
  },
  async ensureChildModes(taskId:number,actorId:number,transaction:DatabaseTransaction):Promise<void>{
    await transaction.request().input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId).query(`
      INSERT dbo.TM_collaboration_subtask_modes(subtask_id,task_id,assignment_mode,changed_by_user_id)
      SELECT child.id,child.task_id,CASE WHEN child.assignee_user_id IS NULL THEN 'INHERIT' ELSE 'CUSTOM' END,@actorId
      FROM dbo.TM_subtasks child WHERE child.task_id=@taskId AND child.deleted_at_utc IS NULL
        AND NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_subtask_modes mode WHERE mode.subtask_id=child.id);`);
  },
  async setChildMode(taskId:number,subtaskId:number,actorId:number,mode:'INHERIT'|'CUSTOM',transaction:DatabaseTransaction):Promise<void>{
    const result=await transaction.request().input('taskId',sql.BigInt,taskId).input('subtaskId',sql.BigInt,subtaskId)
      .input('actorId',sql.Int,actorId).input('mode',sql.VarChar(12),mode)
      .query(`UPDATE dbo.TM_collaboration_subtask_modes SET assignment_mode=@mode,
        changed_by_user_id=@actorId,changed_at_utc=SYSUTCDATETIME()
        WHERE task_id=@taskId AND subtask_id=@subtaskId;`);
    if (result.rowsAffected[0]!==1) throw new Error('Collaborative subtask mode missing.');
  },
  async addAssignment(taskId:number,subtaskId:number|null,userId:number,origin:'EXPLICIT'|'INHERITED',actorId:number,
    transaction:DatabaseTransaction,complete=false):Promise<void>{
    const result=await transaction.request().input('taskId',sql.BigInt,taskId)
      .input('subtaskId',sql.BigInt,subtaskId).input('userId',sql.Int,userId)
      .input('origin',sql.VarChar(12),origin).input('actorId',sql.Int,actorId)
      .input('complete',sql.Bit,complete).query<{id:number|string}>(`
      INSERT dbo.TM_collaboration_assignments(task_id,subtask_id,assignee_user_id,assignment_origin,
        assigned_by_user_id,state,completed_at_utc)
      OUTPUT inserted.id id
      VALUES(@taskId,@subtaskId,@userId,@origin,@actorId,
        CASE WHEN @complete=1 THEN 'DONE' ELSE 'TODO' END,
        CASE WHEN @complete=1 THEN SYSUTCDATETIME() ELSE NULL END);`);
    const id=Number(result.recordset[0]?.id);
    await this.event(id,actorId,'ASSIGNED',transaction);
  },
  async revokeAssignment(assignmentId:number,actorId:number,transaction:DatabaseTransaction):Promise<void>{
    await transaction.request().input('id',sql.BigInt,assignmentId).input('actorId',sql.Int,actorId)
      .query(`UPDATE dbo.TM_collaboration_assignments SET is_active=0,
        proxy_user_id=NULL,proxy_assigned_at_utc=NULL,
        revoked_at_utc=SYSUTCDATETIME(),revoked_by_user_id=@actorId
        WHERE id=@id AND is_active=1;`);
    await this.event(assignmentId,actorId,'REMOVED',transaction);
  },
  async event(assignmentId:number,actorId:number,type:'ASSIGNED'|'REMOVED'|'STARTED'|'COMPLETED'|'REOPENED'|'NOTE_ADDED'|'FILE_ADDED'|'FILE_REMOVED',transaction:DatabaseTransaction,fileName:string|null=null):Promise<void>{
    // Write both the detailed collaboration audit and the existing Task Activity timeline
    // in the SAME transaction. Never include note bodies or file storage keys in the
    // shared event payload. Names are snapshots, so later subtask renames do not rewrite history.
    await transaction.request().input('id',sql.BigInt,assignmentId).input('actorId',sql.Int,actorId)
      .input('type',sql.VarChar(25),type).input('fileName',sql.NVarChar(255),fileName)
      .query(`
        INSERT dbo.TM_collaboration_events(assignment_id,actor_user_id,event_type)
        VALUES(@id,@actorId,@type);

        INSERT dbo.TM_task_activity(task_id,owner_user_id,actor_user_id,activity_type,event_data_json)
        SELECT assignment.task_id, task.owner_user_id, @actorId,
          'COLLAB_' + @type,
          (SELECT assignment.id AS assignmentId,
                  assignment.subtask_id AS subtaskId,
                  child.title AS subtaskTitle,
                  assignment.assignee_user_id AS assigneeUserId,
                  assignee.USER_NAME AS assigneeName,
                  assignee.USER_CODE AS assigneeCode,
                  assignee.email AS assigneeEmail,
                  actor.USER_NAME AS actorName,
                  actor.USER_CODE AS actorCode,
                  actor.email AS actorEmail,
                  @fileName AS fileName
           FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM dbo.TM_collaboration_assignments assignment
        JOIN dbo.TM_tasks task ON task.id=assignment.task_id
        JOIN dbo.users assignee ON assignee.USER_ID=assignment.assignee_user_id
        JOIN dbo.users actor ON actor.USER_ID=@actorId
        LEFT JOIN dbo.TM_subtasks child ON child.id=assignment.subtask_id
        WHERE assignment.id=@id;
      `);
  },
  async addNote(assignmentId:number,actorId:number,note:string,transaction:DatabaseTransaction):Promise<void>{
    await transaction.request().input('assignmentId',sql.BigInt,assignmentId)
      .input('actorId',sql.Int,actorId).input('note',sql.NVarChar(4000),note)
      .query(`INSERT dbo.TM_collaboration_work_entries(assignment_id,author_user_id,note)
        VALUES(@assignmentId,@actorId,@note);
        UPDATE dbo.TM_collaboration_assignments SET state='IN_PROGRESS'
        WHERE id=@assignmentId AND is_active=1 AND state='TODO';`);
    await this.event(assignmentId,actorId,'NOTE_ADDED',transaction);
  },
  async updateCompletion(assignmentId:number,completed:boolean,actorId:number,transaction:DatabaseTransaction):Promise<void>{
    await transaction.request().input('id',sql.BigInt,assignmentId).input('completed',sql.Bit,completed)
      .query(`UPDATE dbo.TM_collaboration_assignments SET
        state=CASE WHEN @completed=1 THEN 'DONE' ELSE 'IN_PROGRESS' END,
        completed_at_utc=CASE WHEN @completed=1 THEN SYSUTCDATETIME() ELSE NULL END,
        reopened_at_utc=CASE WHEN @completed=0 THEN SYSUTCDATETIME() ELSE reopened_at_utc END
        WHERE id=@id AND is_active=1;`);
    await this.event(assignmentId,actorId,completed?'COMPLETED':'REOPENED',transaction);
  },
  async syncChildStatus(taskId:number,transaction:DatabaseTransaction,actorId:number|null=null):Promise<void>{
    await transaction.request().input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId).query(`
      DECLARE @changes TABLE (subtask_id BIGINT, subtask_title NVARCHAR(1000), is_completed BIT);
      UPDATE child SET is_completed=CASE WHEN tally.total>0 AND tally.todo=0 THEN 1 ELSE 0 END,
        completed_at_utc=CASE WHEN tally.total>0 AND tally.todo=0 THEN
          COALESCE(child.completed_at_utc,SYSUTCDATETIME()) ELSE NULL END,
        updated_at_utc=SYSUTCDATETIME()
      OUTPUT inserted.id, inserted.title, inserted.is_completed
        INTO @changes(subtask_id,subtask_title,is_completed)
      FROM dbo.TM_subtasks child
      CROSS APPLY (SELECT COUNT(*) total,SUM(CASE WHEN state<>'DONE' THEN 1 ELSE 0 END) todo
        FROM dbo.TM_collaboration_assignments a WHERE a.task_id=@taskId AND a.subtask_id=child.id AND a.is_active=1) tally
      WHERE child.task_id=@taskId AND child.deleted_at_utc IS NULL
      AND child.is_completed<>CASE WHEN tally.total>0 AND tally.todo=0 THEN 1 ELSE 0 END;

      IF @actorId IS NOT NULL
        INSERT dbo.TM_task_activity(task_id,owner_user_id,actor_user_id,activity_type,event_data_json)
        SELECT @taskId, task.owner_user_id, @actorId,
          CASE WHEN change.is_completed=1 THEN 'COLLAB_SUBTASK_COMPLETED' ELSE 'COLLAB_SUBTASK_REOPENED' END,
          (SELECT change.subtask_id AS subtaskId, change.subtask_title AS subtaskTitle,
                  actor.USER_NAME AS actorName, actor.USER_CODE AS actorCode, actor.email AS actorEmail,
                  CAST(1 AS bit) AS automatic FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM @changes change CROSS JOIN dbo.TM_tasks task
        JOIN dbo.users actor ON actor.USER_ID=@actorId WHERE task.id=@taskId;
      `);
  },
  async syncParentStatus(taskId:number,transaction:DatabaseTransaction,actorId:number|null=null):Promise<void>{
    await transaction.request().input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId).query(`
      DECLARE @changes TABLE (owner_id INT, previous_status VARCHAR(15), next_status VARCHAR(15));
      ;WITH main AS (SELECT COUNT(*) total,SUM(CASE WHEN state<>'DONE' THEN 1 ELSE 0 END) todo
        FROM dbo.TM_collaboration_assignments WHERE task_id=@taskId AND subtask_id IS NULL AND is_active=1),
      children AS (SELECT COUNT(*) total,SUM(CASE WHEN is_completed=0 THEN 1 ELSE 0 END) todo
        FROM dbo.TM_subtasks WHERE task_id=@taskId AND deleted_at_utc IS NULL),
      progress AS (SELECT CASE WHEN (main.total>0 OR children.total>0)
        AND COALESCE(main.todo,0)=0 AND COALESCE(children.todo,0)=0 THEN 1 ELSE 0 END isDone,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.TM_collaboration_assignments activeWork
          WHERE activeWork.task_id=@taskId AND activeWork.is_active=1 AND activeWork.state<>'TODO')
          THEN 1 ELSE 0 END isStarted
        FROM main CROSS JOIN children)
      UPDATE task SET status=CASE WHEN progress.isDone=1 THEN 'DONE'
        WHEN progress.isStarted=1 THEN 'IN_PROGRESS' ELSE 'TODO' END,
        completed_at_utc=CASE WHEN progress.isDone=1 THEN COALESCE(task.completed_at_utc,SYSUTCDATETIME()) ELSE NULL END,
        auto_completed_from_subtasks=CASE WHEN progress.isDone=1 THEN 1 ELSE 0 END,
        cancelled_at_utc=NULL,cancellation_reason=NULL,updated_at_utc=SYSUTCDATETIME()
      OUTPUT inserted.owner_user_id,deleted.status,inserted.status
        INTO @changes(owner_id,previous_status,next_status)
      FROM dbo.TM_tasks task CROSS JOIN progress
      WHERE task.id=@taskId AND task.deleted_at_utc IS NULL AND task.status<>'CANCELLED'
        AND task.status<>CASE WHEN progress.isDone=1 THEN 'DONE'
          WHEN progress.isStarted=1 THEN 'IN_PROGRESS' ELSE 'TODO' END;

      IF @actorId IS NOT NULL
        INSERT dbo.TM_task_activity(task_id,owner_user_id,actor_user_id,activity_type,event_data_json)
        SELECT @taskId,owner_id,@actorId,'COLLAB_PARENT_STATUS_CHANGED',
          (SELECT previous_status AS [from],next_status AS [to],
                  actor.USER_NAME AS actorName,actor.USER_CODE AS actorCode,actor.email AS actorEmail,
                  CAST(1 AS bit) AS automatic FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM @changes JOIN dbo.users actor ON actor.USER_ID=@actorId;
      `);
  },
  async snapshot(taskId:number,actorId:number,ownerId:number):Promise<unknown>{
    const pool=await getDatabasePool();
    const [members,notes,files,modes]=await Promise.all([
      pool.request().input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId).input('ownerId',sql.Int,ownerId)
        .query(`SELECT a.id,a.task_id AS taskId,a.subtask_id AS subtaskId,a.assignee_user_id AS userId,
          a.state,a.is_active AS isActive,a.completed_at_utc AS completedAtUtc,a.assigned_at_utc AS assignedAtUtc,
          a.proxy_user_id AS proxyUserId,COALESCE(proxyPerson.USER_NAME,proxyPerson.USER_CODE) AS proxyName,
          p.USER_NAME AS userName,p.USER_CODE AS userCode,p.email
          FROM dbo.TM_collaboration_assignments a JOIN dbo.users p ON p.USER_ID=a.assignee_user_id
          LEFT JOIN dbo.users proxyPerson ON proxyPerson.USER_ID=a.proxy_user_id
          WHERE a.task_id=@taskId AND (@actorId=@ownerId OR a.is_active=1 AND
            (a.assignee_user_id=@actorId OR a.proxy_user_id=@actorId))
          ORDER BY a.subtask_id,a.id;`),
      pool.request().input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId).input('ownerId',sql.Int,ownerId)
        .query(`SELECT e.id,e.assignment_id AS assignmentId,e.note,e.created_at_utc AS createdAtUtc,
          e.author_user_id AS authorUserId,author.USER_NAME AS authorName
          FROM dbo.TM_collaboration_work_entries e JOIN dbo.TM_collaboration_assignments a ON a.id=e.assignment_id
          LEFT JOIN dbo.users author ON author.USER_ID=e.author_user_id
          WHERE a.task_id=@taskId AND (@actorId=@ownerId OR a.is_active=1 AND
            (a.assignee_user_id=@actorId OR a.proxy_user_id=@actorId))
          ORDER BY e.created_at_utc,e.id;`),
      pool.request().input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId).input('ownerId',sql.Int,ownerId)
        .query(`SELECT f.id,f.assignment_id AS assignmentId,f.original_file_name AS originalFileName,
          f.size_bytes AS sizeBytes,f.mime_type AS mimeType, f.file_extension AS fileExtension,
          f.uploaded_by_user_id AS uploadedByUserId,
          COALESCE(uploader.USER_NAME,uploader.USER_CODE) AS uploadedByName,
          f.uploaded_at_utc AS uploadedAtUtc
          FROM dbo.TM_collaboration_files f JOIN dbo.TM_collaboration_assignments a ON a.id=f.assignment_id
          LEFT JOIN dbo.users uploader ON uploader.USER_ID=f.uploaded_by_user_id
          WHERE a.task_id=@taskId AND f.deleted_at_utc IS NULL
            AND (@actorId=@ownerId OR a.is_active=1 AND
              (a.assignee_user_id=@actorId OR a.proxy_user_id=@actorId))
          ORDER BY f.uploaded_at_utc,f.id;`),
      pool.request().input('taskId',sql.BigInt,taskId).input('actorId',sql.Int,actorId).input('ownerId',sql.Int,ownerId)
        .query(`SELECT subtask_id AS subtaskId,assignment_mode AS mode
        FROM dbo.TM_collaboration_subtask_modes mode WHERE mode.task_id=@taskId
          AND (@actorId=@ownerId OR EXISTS (SELECT 1 FROM dbo.TM_collaboration_assignments assignment
            WHERE assignment.task_id=@taskId AND assignment.subtask_id=mode.subtask_id
              AND (assignment.assignee_user_id=@actorId OR assignment.proxy_user_id=@actorId)
              AND assignment.is_active=1));`),
    ]);
    const progress=await pool.request().input('taskId',sql.BigInt,taskId)
      .input('actorId',sql.Int,actorId).input('ownerId',sql.Int,ownerId)
      .query<{scopeId:number|null;total:number;completed:number}>(`
      SELECT a.subtask_id scopeId,COUNT(*) total,
        SUM(CASE WHEN a.state='DONE' THEN 1 ELSE 0 END) completed
      FROM dbo.TM_collaboration_assignments a
      WHERE a.task_id=@taskId AND a.is_active=1
        AND (a.subtask_id IS NULL OR EXISTS (SELECT 1 FROM dbo.TM_subtasks child
          WHERE child.id=a.subtask_id AND child.deleted_at_utc IS NULL))
        AND (@actorId=@ownerId OR a.subtask_id IS NULL OR EXISTS(
          SELECT 1 FROM dbo.TM_collaboration_assignments member
          WHERE member.task_id=@taskId AND member.subtask_id=a.subtask_id
            AND (member.assignee_user_id=@actorId OR member.proxy_user_id=@actorId) AND member.is_active=1))
      GROUP BY a.subtask_id;`);
    return {members:members.recordset,notes:notes.recordset,
      files:files.recordset.map(file=>({...file,originalFileName:recoverAttachmentFileName(file.originalFileName)})),
      modes:modes.recordset,progress:progress.recordset};
  },
  async file(id:string,transaction?:DatabaseTransaction):Promise<{id:string;taskId:number;assignmentId:number;assigneeUserId:number;ownerUserId:number;
    uploadedByUserId:number;proxyUserId:number|null;key:string;name:string;mime:string;size:number;isActive:boolean}|null>{
    const request=await requestFor(transaction);
    const result=await request.input('id',sql.UniqueIdentifier,id)
      .query<{id:string;taskId:number;assignmentId:number;assigneeUserId:number;ownerUserId:number;
        uploadedByUserId:number;proxyUserId:number|null;key:string;name:string;mime:string;size:number;isActive:boolean}>(`
      SELECT f.id,a.task_id AS taskId,a.id AS assignmentId,a.assignee_user_id AS assigneeUserId,
        t.owner_user_id AS ownerUserId,f.uploaded_by_user_id AS uploadedByUserId,
        a.proxy_user_id AS proxyUserId,
        f.storage_key AS [key],f.original_file_name AS name,
        f.mime_type AS mime,f.size_bytes AS size,a.is_active AS isActive
      FROM dbo.TM_collaboration_files f JOIN dbo.TM_collaboration_assignments a ON a.id=f.assignment_id
      JOIN dbo.TM_collaboration_tasks t ON t.task_id=a.task_id
      WHERE f.id=@id AND f.deleted_at_utc IS NULL;`);
    return result.recordset[0]??null;
  },
  async deleteOwnFile(id:string,actorId:number,transaction:DatabaseTransaction):Promise<boolean>{
    const result=await transaction.request().input('id',sql.UniqueIdentifier,id)
      .input('actorId',sql.Int,actorId).query(`
        UPDATE f SET deleted_at_utc=SYSUTCDATETIME(),deleted_by_user_id=@actorId
        FROM dbo.TM_collaboration_files f
        JOIN dbo.TM_collaboration_assignments a ON a.id=f.assignment_id
        WHERE f.id=@id AND f.uploaded_by_user_id=@actorId AND f.deleted_at_utc IS NULL
          AND a.is_active=1 AND (a.assignee_user_id=@actorId OR a.proxy_user_id=@actorId);`);
    return result.rowsAffected[0]===1;
  },
  async attachFile(assignmentId:number,actorId:number,metadata:{name:string;key:string;mime:string;extension:string;size:number},transaction:DatabaseTransaction):Promise<string>{
    const result=await transaction.request().input('assignmentId',sql.BigInt,assignmentId)
      .input('actorId',sql.Int,actorId).input('name',sql.NVarChar(255),metadata.name)
      .input('key',sql.NVarChar(255),metadata.key).input('mime',sql.NVarChar(150),metadata.mime)
      .input('extension',sql.NVarChar(20),metadata.extension).input('size',sql.BigInt,metadata.size)
      .query<{id:string}>(`INSERT dbo.TM_collaboration_files
        (assignment_id,uploaded_by_user_id,original_file_name,storage_key,mime_type,file_extension,size_bytes)
        OUTPUT inserted.id id VALUES(@assignmentId,@actorId,@name,@key,@mime,@extension,@size);`);
    await this.event(assignmentId,actorId,'FILE_ADDED',transaction,metadata.name);
    return result.recordset[0]!.id;
  },
};

