import { getDatabasePool, sql } from '../../database/sql.js';
import { assertDiscussionAccess, type DiscussionScope } from './task-discussions.policy.js';

/** No task notes or private evidence are included in a notification or email payload. */
async function fetchMembers(scope:DiscussionScope,senderId:number){
  const pool=await getDatabasePool();
  const members=await pool.request().input('taskId',sql.BigInt,scope.taskId)
    .input('subtaskId',sql.BigInt,scope.subtaskId).input('sender',sql.Int,senderId)
    .query<{userId:number;userCode:string;userName:string;taskTitle:string;listId:number|null;ownerUserId:number;taskStatus:string}>(`
      SELECT DISTINCT users.USER_ID userId,users.USER_CODE userCode,users.USER_NAME userName,t.title taskTitle,t.list_id listId,t.owner_user_id ownerUserId,t.status taskStatus
      FROM dbo.TM_tasks t
      CROSS APPLY (
        SELECT t.owner_user_id AS member_id
        UNION ALL SELECT a.assignee_user_id FROM dbo.TM_collaboration_assignments a
          WHERE a.task_id=t.id AND a.is_active=1 AND
            (a.subtask_id=@subtaskId OR (a.subtask_id IS NULL AND @subtaskId IS NULL))
        UNION ALL SELECT a.proxy_user_id FROM dbo.TM_collaboration_assignments a
          WHERE a.task_id=t.id AND a.is_active=1 AND a.proxy_user_id IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items mi WHERE mi.task_id=t.id)
            AND (a.subtask_id=@subtaskId OR (a.subtask_id IS NULL AND @subtaskId IS NULL))
        UNION ALL SELECT g.assignee_user_id FROM dbo.TM_general_task_assignments g
          WHERE g.task_id=t.id AND @subtaskId IS NULL AND
            NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
        UNION ALL SELECT p.proxy_user_id FROM dbo.TM_task_proxies p
          JOIN dbo.TM_general_task_assignments g ON g.task_id=p.task_id
          LEFT JOIN dbo.TM_subtasks child ON child.id=@subtaskId AND child.task_id=p.task_id AND child.deleted_at_utc IS NULL
          WHERE p.task_id=t.id AND p.revoked_at_utc IS NULL
            AND NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
            AND ((@subtaskId IS NULL AND p.subtask_id IS NULL AND p.principal_user_id=g.assignee_user_id)
              OR (@subtaskId IS NOT NULL AND child.id IS NOT NULL AND
                ((p.subtask_id=child.id AND p.principal_user_id=COALESCE(child.assignee_user_id,g.assignee_user_id,t.owner_user_id))
                  OR (p.subtask_id IS NULL AND p.principal_user_id=g.assignee_user_id
                    AND p.principal_user_id=COALESCE(child.assignee_user_id,g.assignee_user_id,t.owner_user_id)))))
        UNION ALL SELECT mi.assignee_user_id FROM dbo.TM_meeting_action_items mi
          WHERE mi.task_id=t.id AND @subtaskId IS NULL AND
            NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
        UNION ALL SELECT COALESCE(s.assignee_user_id,g.assignee_user_id,mi.assignee_user_id)
          FROM dbo.TM_subtasks s
          LEFT JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
          LEFT JOIN dbo.TM_meeting_action_items mi ON mi.task_id=t.id
          WHERE s.task_id=t.id AND s.id=@subtaskId AND
            NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
      ) people
      JOIN dbo.users users ON users.USER_ID=people.member_id AND users.IS_ACTIVE=1
      JOIN dbo.TM_user_access access ON access.portal_user_id=users.USER_ID AND access.is_active=1
      WHERE t.id=@taskId AND users.USER_ID<>@sender AND t.deleted_at_utc IS NULL;`);
  return members.recordset;
}

export async function listDiscussionMembers(actorId:number,scope:DiscussionScope){
  await assertDiscussionAccess(actorId,scope);
  const candidates=await fetchMembers(scope,0);
  const authorized=[] as {userId:number;userCode:string;userName:string;role:'owner'|'participant';canView:boolean;canSend:boolean}[];
  for(const p of candidates){try{await assertDiscussionAccess(Number(p.userId),scope);authorized.push({userId:Number(p.userId),userCode:p.userCode,userName:p.userName,role:Number(p.userId)===Number(p.ownerUserId)?'owner':'participant',canView:true,canSend:p.taskStatus!=='CANCELLED'})}catch{}}
  return authorized;
}

export async function notifyDiscussionMembers(senderId:number,scope:DiscussionScope,messageId:number,_body:string,
  onlyMentionIds?:number[],isEdit=false):Promise<void>{
  const members=await fetchMembers(scope,senderId);
  const pool=await getDatabasePool();
  for(const person of members){
    if(onlyMentionIds&&!onlyMentionIds.includes(Number(person.userId)))continue;
    try {await assertDiscussionAccess(Number(person.userId),scope);}catch{continue;}
    const mention=await pool.request().input('messageId',sql.BigInt,messageId)
      .input('recipient',sql.Int,person.userId)
      .query<{mentioned:number}>(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.TM_task_discussion_mentions
        WHERE message_id=@messageId AND mentioned_user_id=@recipient) THEN 1 ELSE 0 END AS int) mentioned;`);
    const mentioned=mention.recordset[0]?.mentioned===1;
    if(isEdit&&!mentioned)continue;
    const eventType=mentioned?'TASK_DISCUSSION_MENTION':'TASK_DISCUSSION_MESSAGE';
    await pool.request().input('recipient',sql.Int,person.userId)
      .input('event',sql.VarChar(40),eventType)
      .input('dedupe',sql.VarChar(220),`${isEdit?'TASK_DISCUSSION_EDIT':'TASK_DISCUSSION'}:${messageId}:${person.userId}`)
      .input('taskId',sql.BigInt,scope.taskId)
      .input('subtaskId',sql.BigInt,scope.subtaskId)
      .input('listId',sql.BigInt,person.listId)
      .input('title',sql.NVarChar(1000),'Task discussion')
      .query(`IF NOT EXISTS(SELECT 1 FROM dbo.TM_notifications WITH(UPDLOCK,HOLDLOCK)
        WHERE owner_user_id=@recipient AND dedupe_key=@dedupe)
        INSERT dbo.TM_notifications(owner_user_id,notification_type,dedupe_key,subject_title,
          context_title,task_id,subtask_id,list_id,email_processed_at_utc)
        VALUES(@recipient,@event,@dedupe,@title,N'Task discussion',@taskId,@subtaskId,@listId,NULL);`);
  }
}

/** Called by email worker both at queue-time and again at send-time. */
export async function discussionEmailAllowed(recipientId:number,messageId:number):Promise<boolean>{
  const pool=await getDatabasePool();
  const result=await pool.request().input('messageId',sql.BigInt,messageId)
    .query<{taskId:number;subtaskId:number|null;deletedAtUtc:Date|null;authorId:number}>(`
      SELECT task_id taskId,subtask_id subtaskId,deleted_at_utc deletedAtUtc,author_user_id authorId
      FROM dbo.TM_task_discussion_messages WHERE id=@messageId;`);
  const row=result.recordset[0];
  if(!row || row.deletedAtUtc || Number(row.authorId)===recipientId)return false;
  try{await assertDiscussionAccess(recipientId,{taskId:Number(row.taskId),subtaskId:row.subtaskId===null?null:Number(row.subtaskId)});return true}
  catch{return false}
}


/** Email-safe projection of an authorized, still-active mention. Never log the body. */
export async function discussionMentionEmailContext(recipientId:number,messageId:number):Promise<{
  taskTitle:string;senderName:string;messagePreview:string
}|null>{
  if(!await discussionEmailAllowed(recipientId,messageId))return null;
  const pool=await getDatabasePool();
  const result=await pool.request().input('messageId',sql.BigInt,messageId)
    .input('recipient',sql.Int,recipientId)
    .query<{taskTitle:string;senderName:string;body:string}>(`
      SELECT t.title taskTitle,COALESCE(NULLIF(LTRIM(RTRIM(author.USER_NAME)),N''),CONVERT(nvarchar(100),author.USER_CODE)) senderName,m.body
      FROM dbo.TM_task_discussion_messages m
      JOIN dbo.TM_tasks t ON t.id=m.task_id AND t.deleted_at_utc IS NULL
      JOIN dbo.users author ON author.USER_ID=m.author_user_id
      JOIN dbo.users recipient ON recipient.USER_ID=@recipient
      WHERE m.id=@messageId AND m.deleted_at_utc IS NULL AND m.body IS NOT NULL
        AND m.author_user_id<>@recipient
        AND (EXISTS(SELECT 1 FROM dbo.TM_task_discussion_mentions mentions
            WHERE mentions.message_id=m.id AND mentions.mentioned_user_id=@recipient)
          OR m.body=N'@'+CONVERT(nvarchar(100),recipient.USER_CODE)
          OR m.body LIKE N'@'+CONVERT(nvarchar(100),recipient.USER_CODE)+N'[^0-9A-Za-z]%'
          OR m.body LIKE N'%[^0-9A-Za-z]@'+CONVERT(nvarchar(100),recipient.USER_CODE)
          OR m.body LIKE N'%[^0-9A-Za-z]@'+CONVERT(nvarchar(100),recipient.USER_CODE)+N'[^0-9A-Za-z]%');`);
  const row=result.recordset[0];
  return row?{taskTitle:row.taskTitle,senderName:row.senderName,messagePreview:row.body.slice(0,800)}:null;
}

