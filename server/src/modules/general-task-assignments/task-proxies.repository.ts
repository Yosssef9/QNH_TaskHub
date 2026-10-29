import { getDatabasePool, sql } from '../../database/sql.js';
import type { DatabaseTransaction } from '../../database/types.js';

export interface TaskProxyGrant {
  id:number; taskId:number; subtaskId:number|null; principalUserId:number; proxyUserId:number;
  proxyName:string; proxyCode:string; appointedAtUtc:string;
}
type Row={id:number|string;taskId:number|string;subtaskId:number|string|null;
  principalUserId:number;proxyUserId:number;proxyName:string;proxyCode:string;appointedAtUtc:Date};
function map(row:Row):TaskProxyGrant{return {
  id:Number(row.id),taskId:Number(row.taskId),subtaskId:row.subtaskId==null?null:Number(row.subtaskId),
  principalUserId:row.principalUserId,proxyUserId:row.proxyUserId,
  proxyName:row.proxyName,proxyCode:row.proxyCode,appointedAtUtc:row.appointedAtUtc.toISOString(),
};}
/** Authorization is checked against the CURRENT assignee on every read, not merely the grant row.
 * Parent proxy can execute only child scopes whose effective assignee is its principal. */
export const taskProxiesRepository={
  async grants(taskId:number, transaction?:DatabaseTransaction):Promise<TaskProxyGrant[]> {
    const request=transaction?transaction.request():(await getDatabasePool()).request();
    const result=await request.input('taskId',sql.BigInt,taskId).query<Row>(`
      SELECT p.id,p.task_id taskId,p.subtask_id subtaskId,p.principal_user_id principalUserId,
        p.proxy_user_id proxyUserId,COALESCE(u.USER_NAME,u.USER_CODE) proxyName,
        u.USER_CODE proxyCode,p.appointed_at_utc appointedAtUtc
      FROM dbo.TM_task_proxies p
      JOIN dbo.TM_tasks t ON t.id=p.task_id AND t.deleted_at_utc IS NULL
      JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
      JOIN dbo.users u ON u.USER_ID=p.proxy_user_id AND u.IS_ACTIVE=1
      JOIN dbo.TM_user_access a ON a.portal_user_id=u.USER_ID AND a.is_active=1
      LEFT JOIN dbo.TM_subtasks s ON s.id=p.subtask_id AND s.task_id=t.id AND s.deleted_at_utc IS NULL
      WHERE p.task_id=@taskId AND p.revoked_at_utc IS NULL
        AND NOT EXISTS(SELECT 1 FROM dbo.TM_collaboration_tasks c WHERE c.task_id=t.id)
        AND ((p.subtask_id IS NULL AND p.principal_user_id=g.assignee_user_id)
          OR (p.subtask_id IS NOT NULL AND s.id IS NOT NULL
            AND p.principal_user_id=COALESCE(s.assignee_user_id,g.assignee_user_id,t.owner_user_id)))
      ORDER BY p.subtask_id,p.id;`);
    return result.recordset.map(map);
  },
  async forActor(taskId:number,actorId:number,transaction?:DatabaseTransaction){
    const rows=await this.grants(taskId,transaction);
    return rows.filter(row=>row.proxyUserId===actorId);
  },
  async isExecutor(taskId:number,subtaskId:number|null,actorId:number,transaction?:DatabaseTransaction){
    const grants=await this.forActor(taskId,actorId,transaction);
    if(subtaskId===null) return grants.some(grant=>grant.subtaskId===null);
    if(grants.some(grant=>grant.subtaskId===subtaskId)) return true;
    const main=grants.find(grant=>grant.subtaskId===null);
    if(!main)return false;
    const request=transaction?transaction.request():(await getDatabasePool()).request();
    const result=await request.input('taskId',sql.BigInt,taskId).input('subtaskId',sql.BigInt,subtaskId)
      .input('principal',sql.Int,main.principalUserId).query<{id:number}>(`
        SELECT TOP(1) 1 id FROM dbo.TM_subtasks s
        JOIN dbo.TM_tasks t ON t.id=s.task_id AND t.deleted_at_utc IS NULL
        JOIN dbo.TM_general_task_assignments g ON g.task_id=t.id
        WHERE s.task_id=@taskId AND s.id=@subtaskId AND s.deleted_at_utc IS NULL
        AND COALESCE(s.assignee_user_id,g.assignee_user_id,t.owner_user_id)=@principal;`);
    return result.recordset.length>0;
  },
  async forVisibleScope(taskId:number,actorId:number,transaction?:DatabaseTransaction){
    return this.forActor(taskId,actorId,transaction);
  },
  async set(transaction:DatabaseTransaction,params:{taskId:number;ownerId:number;subtaskId:number|null;
      principalId:number;actorId:number;proxyId:number|null}) {
    const {taskId,ownerId,subtaskId,principalId,actorId,proxyId}=params;
    const existing=await transaction.request().input('taskId',sql.BigInt,taskId)
      .input('subtaskId',sql.BigInt,subtaskId).query<{proxyUserId:number;principalUserId:number}>(`
      SELECT proxy_user_id proxyUserId,principal_user_id principalUserId
      FROM dbo.TM_task_proxies WITH(UPDLOCK,HOLDLOCK)
      WHERE task_id=@taskId AND ((subtask_id=@subtaskId) OR (subtask_id IS NULL AND @subtaskId IS NULL))
        AND revoked_at_utc IS NULL;`);
    if(proxyId===null && existing.recordset.length===0)return false;
    if(existing.recordset[0]?.proxyUserId===proxyId&&existing.recordset[0]?.principalUserId===principalId)return false;
    await transaction.request().input('taskId',sql.BigInt,taskId).input('subtaskId',sql.BigInt,subtaskId)
      .input('actor',sql.Int,actorId).query(`UPDATE dbo.TM_task_proxies
      SET revoked_at_utc=SYSUTCDATETIME(),revoked_by_user_id=@actor
      WHERE task_id=@taskId AND (subtask_id=@subtaskId OR (subtask_id IS NULL AND @subtaskId IS NULL))
        AND revoked_at_utc IS NULL;`);
    if(proxyId!==null){
      await transaction.request().input('taskId',sql.BigInt,taskId).input('subtaskId',sql.BigInt,subtaskId)
        .input('owner',sql.Int,ownerId).input('principal',sql.Int,principalId)
        .input('proxy',sql.Int,proxyId).input('actor',sql.Int,actorId).query(`
        INSERT dbo.TM_task_proxies(task_id,subtask_id,owner_user_id,principal_user_id,proxy_user_id,appointed_by_user_id)
        VALUES(@taskId,@subtaskId,@owner,@principal,@proxy,@actor);`);
    }
    return true;
  },
  async revoke(transaction:DatabaseTransaction,taskId:number,subtaskId:number|null,actorId:number){
    await transaction.request().input('taskId',sql.BigInt,taskId).input('subtaskId',sql.BigInt,subtaskId)
      .input('actor',sql.Int,actorId).query(`UPDATE dbo.TM_task_proxies
        SET revoked_at_utc=SYSUTCDATETIME(),revoked_by_user_id=@actor
        WHERE task_id=@taskId AND revoked_at_utc IS NULL
          AND (subtask_id=@subtaskId OR (subtask_id IS NULL AND @subtaskId IS NULL));`);
  },
};
