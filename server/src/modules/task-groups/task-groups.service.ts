import { getDatabasePool, sql } from '../../database/sql.js';
import { withTransaction } from '../../database/transaction.js';
import type { DatabaseTransaction } from '../../database/types.js';
import { AppError } from '../../shared/errors/app-error.js';
import { getCurrentDateInAppTimeZone } from '../../shared/utils/date.utils.js';
import { taskTypeConditionSql } from '../collaboration/collaboration-card-summary.sql.js';
import { taskTagsFilterSql } from '../tags/task-tags.sql.js';
import type { TaskGroupListQuery } from './task-groups.schemas.js';
import { assertCompleteSiblingReorder, assertNoGroupCycle } from './task-groups.policy.js';

export interface TaskGroup {
  id: number;
  listId: number;
  parentGroupId: number | null;
  name: string;
  displayOrder: number;
  directTaskCount: number;
  totalTaskCount: number;
  directDoneCount: number;
  totalDoneCount: number;
}
type GroupRow = { id: number | string; listId: number | string; parentGroupId: number | string | null; name: string; displayOrder: number };
type TaskCountRow = { groupId: number | string | null; total: number | string; done: number | string | null };

/** Same date-filter expressions as the normal Task List query. */
const dueSql = {
  ALL: '',
  OVERDUE: "AND task.due_date < @today AND task.status NOT IN ('DONE', 'CANCELLED')",
  TODAY: 'AND task.due_date = @today',
  UPCOMING: 'AND task.due_date > @today',
  NO_DATE: 'AND task.due_date IS NULL',
} as const;

function err(code:string,message:string,statusCode=400):AppError{
  return new AppError({code,message,statusCode});
}
async function assertListOwner(tx:DatabaseTransaction,ownerId:number,listId:number) {
  const r=await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId).query(`
    SELECT TOP (1) id FROM dbo.TM_lists WITH(UPDLOCK,HOLDLOCK)
    WHERE id=@list AND owner_user_id=@owner AND archived_at_utc IS NULL`);
  if (!r.recordset.length) throw err('TASK_GROUP_LIST_NOT_FOUND','Task List not found.',404);
}
async function groupsInList(tx:DatabaseTransaction,ownerId:number,listId:number) {
  const r=await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId).query<GroupRow>(`
    SELECT id, list_id AS listId, parent_group_id AS parentGroupId, name,
      display_order AS displayOrder, CAST(0 AS bigint) AS directTaskCount
    FROM dbo.TM_task_groups WITH(UPDLOCK,HOLDLOCK)
    WHERE list_id=@list AND owner_user_id=@owner`);
  return r.recordset;
}
async function validParent(tx:DatabaseTransaction,ownerId:number,listId:number,parentId:number|null){
  if(parentId===null)return;
  const r=await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId)
    .input('parent',sql.BigInt,parentId).query(`SELECT TOP (1) id FROM dbo.TM_task_groups
      WHERE id=@parent AND list_id=@list AND owner_user_id=@owner`);
  if(!r.recordset.length)throw err('TASK_GROUP_PARENT_INVALID','Parent group does not belong to this List.');
}

function translateConflict(error:unknown):never{
  if(typeof error==='object' && error!==null && 'number' in error && [2601,2627].includes(Number(error.number)))
    throw err('TASK_GROUP_DUPLICATE','Another group already has this name under the same parent.',409);
  throw error;
}
export const taskGroupsService={
  async list(ownerId: number, listId: number, filters: TaskGroupListQuery): Promise<{groups:TaskGroup[];ungroupedCount:number;ungroupedDoneCount:number}> {
    const pool = await getDatabasePool();
    const own = await pool.request().input('owner', sql.Int, ownerId).input('list', sql.BigInt, listId).query(`
      SELECT TOP(1) id FROM dbo.TM_lists WHERE id=@list AND owner_user_id=@owner AND archived_at_utc IS NULL`);
    if (!own.recordset.length) throw err('TASK_GROUP_LIST_NOT_FOUND', 'Task List not found.', 404);

    // The hierarchy is returned even when no tasks match, for List-owner group management.
    const result = await pool.request().input('owner', sql.Int, ownerId).input('list', sql.BigInt, listId).query<GroupRow>(`
      SELECT id,list_id AS listId,parent_group_id AS parentGroupId,name,display_order AS displayOrder
      FROM dbo.TM_task_groups WHERE list_id=@list AND owner_user_id=@owner
      ORDER BY display_order,id`);

    // Filtered aggregate is independent of pagination. Use the SAME task type, tag,
    // status, priority, search and due-date predicates used in tasks.repository.ts.
    // Counting per group in one query avoids querying every collapsed group.
    const counts = await pool.request()
      .input('owner', sql.Int, ownerId)
      .input('list', sql.BigInt, listId)
      .input('today', sql.Date, getCurrentDateInAppTimeZone())
      .input('search', sql.NVarChar(100), filters.search ? `%${filters.search}%` : null)
      .input('status', sql.VarChar(20), filters.status ?? null)
      .input('priority', sql.VarChar(10), filters.priority ?? null)
      .input('taskType', sql.VarChar(12), filters.taskType)
      .input('tagIds', sql.VarChar(240), filters.tagIds || null)
      .input('tagMatch', sql.VarChar(12), filters.tagMatch)
      .query<TaskCountRow>(`
        SELECT task.group_id AS groupId, COUNT_BIG(*) AS total,
          SUM(CASE WHEN task.status = 'DONE' THEN CAST(1 AS bigint) ELSE CAST(0 AS bigint) END) AS done
        FROM dbo.TM_tasks AS task
        WHERE task.owner_user_id=@owner AND task.list_id=@list
          AND task.kpi_instance_id IS NULL AND task.deleted_at_utc IS NULL
          AND (@search IS NULL OR task.title LIKE @search)
          AND (@status IS NULL OR task.status=@status)
          AND (@priority IS NULL OR task.priority=@priority)
          AND ${taskTypeConditionSql} AND ${taskTagsFilterSql}
          ${dueSql[filters.due]}
        GROUP BY task.group_id`);

    const byGroup = new Map<number | null, {total: number; done: number}>();
    for (const row of counts.recordset) {
      byGroup.set(row.groupId === null ? null : Number(row.groupId), {
        total: Number(row.total), done: Number(row.done ?? 0),
      });
    }
    const groups: TaskGroup[] = result.recordset.map(g => {
      const id = Number(g.id);
      const count = byGroup.get(id);
      return { ...g, id, listId: Number(g.listId),
        parentGroupId: g.parentGroupId === null ? null : Number(g.parentGroupId),
        directTaskCount: count?.total ?? 0, totalTaskCount: count?.total ?? 0,
        directDoneCount: count?.done ?? 0, totalDoneCount: count?.done ?? 0,
      };
    });
    const map = new Map(groups.map(g => [g.id, g]));
    const children = new Map<number, number[]>();
    for (const g of groups) if (g.parentGroupId !== null) {
      const ids = children.get(g.parentGroupId) ?? []; ids.push(g.id); children.set(g.parentGroupId, ids);
    }
    const visited = new Set<number>(); const visiting = new Set<number>(); const ordered: number[] = [];
    for (const group of groups) {
      const stack: [number, boolean][] = [[group.id, false]];
      while (stack.length) {
        const [id, done] = stack.pop()!;
        if (done) { visiting.delete(id); visited.add(id); ordered.push(id); continue; }
        if (visited.has(id)) continue;
        if (visiting.has(id)) throw err('TASK_GROUP_CYCLE', 'Stored group hierarchy contains a cycle.', 409);
        visiting.add(id); stack.push([id, true]);
        for (const childId of children.get(id) ?? []) if (!visited.has(childId)) stack.push([childId, false]);
      }
    }
    for (const id of ordered) {
      const g = map.get(id)!;
      if (g.parentGroupId !== null) {
        const parent = map.get(g.parentGroupId)!;
        parent.totalTaskCount += g.totalTaskCount;
        parent.totalDoneCount += g.totalDoneCount;
      }
    }
    const ungrouped = byGroup.get(null);
    return { groups, ungroupedCount: ungrouped?.total ?? 0, ungroupedDoneCount: ungrouped?.done ?? 0 };
  },
  async create(ownerId:number,listId:number,input:{name:string;parentGroupId:number|null}){
    try{return await withTransaction(async tx=>{
      await assertListOwner(tx,ownerId,listId);
      await validParent(tx,ownerId,listId,input.parentGroupId);
      const result=await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId)
        .input('parent',sql.BigInt,input.parentGroupId).input('name',sql.NVarChar(150),input.name).query<{id:number}>(`
        INSERT dbo.TM_task_groups(list_id,owner_user_id,parent_group_id,name,display_order)
        OUTPUT inserted.id
        SELECT @list,@owner,@parent,@name,COALESCE(MAX(display_order),0)+1
        FROM dbo.TM_task_groups WHERE list_id=@list AND owner_user_id=@owner
          AND ((@parent IS NULL AND parent_group_id IS NULL) OR parent_group_id=@parent)`);
      return {id:Number(result.recordset[0]!.id)};
    });}catch(error){translateConflict(error);}
  },
  async update(ownerId:number,listId:number,groupId:number,input:{name?:string;parentGroupId?:number|null;displayOrder?:number}){
    try{return await withTransaction(async tx=>{
      await assertListOwner(tx,ownerId,listId);
      const rows=await groupsInList(tx,ownerId,listId);
      const current=rows.find(row=>Number(row.id)===groupId);
      if(!current)throw err('TASK_GROUP_NOT_FOUND','Group not found.',404);
      const parent=input.parentGroupId===undefined?(current.parentGroupId===null?null:Number(current.parentGroupId)):input.parentGroupId;
      assertNoGroupCycle(rows,groupId,parent);
      await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId)
        .input('id',sql.BigInt,groupId).input('parent',sql.BigInt,parent)
        .input('name',sql.NVarChar(150),input.name??current.name)
        .input('order',sql.Int,input.displayOrder??current.displayOrder).query(`
        UPDATE dbo.TM_task_groups SET parent_group_id=@parent,name=@name,display_order=@order,
          updated_at_utc=SYSUTCDATETIME()
        WHERE id=@id AND list_id=@list AND owner_user_id=@owner`);
      return {id:groupId};
    });}catch(error){translateConflict(error);}
  },
  async remove(ownerId:number,listId:number,groupId:number){
    try{await withTransaction(async tx=>{
      await assertListOwner(tx,ownerId,listId);
      const groups=await groupsInList(tx,ownerId,listId);
      const current=groups.find(g=>Number(g.id)===groupId);
      if(!current)throw err('TASK_GROUP_NOT_FOUND','Group not found.',404);
      // Promote direct child groups and tasks. Database uniqueness rejects a conflicting sibling name.
      await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId)
        .input('id',sql.BigInt,groupId).input('parent',sql.BigInt,current.parentGroupId).query(`
        UPDATE dbo.TM_task_groups SET parent_group_id=@parent,updated_at_utc=SYSUTCDATETIME()
        WHERE parent_group_id=@id AND list_id=@list AND owner_user_id=@owner;
        UPDATE dbo.TM_tasks SET group_id=@parent,updated_at_utc=SYSUTCDATETIME()
        WHERE group_id=@id AND list_id=@list AND owner_user_id=@owner;
        DELETE dbo.TM_task_groups WHERE id=@id AND list_id=@list AND owner_user_id=@owner;`);
    });}catch(error){translateConflict(error);}
  },
  async reorder(ownerId:number,listId:number,parentGroupId:number|null,groupIds:number[]){
    await withTransaction(async tx=>{
      await assertListOwner(tx,ownerId,listId);
      const rows=await groupsInList(tx,ownerId,listId);
      // Normalize SQL BIGINT IDs before checking that the entire sibling set was submitted.
      assertCompleteSiblingReorder(rows,parentGroupId,groupIds);
      for(let i=0;i<groupIds.length;i++){
        await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId)
          .input('group',sql.BigInt,groupIds[i]).input('order',sql.Int,i+1).query(`
          UPDATE dbo.TM_task_groups SET display_order=@order,updated_at_utc=SYSUTCDATETIME()
          WHERE id=@group AND list_id=@list AND owner_user_id=@owner`);
      }
    });
  },
  async bulkMove(ownerId:number,listId:number,taskIds:number[],groupId:number|null){
    await withTransaction(async tx=>{
      await assertListOwner(tx,ownerId,listId);
      await validParent(tx,ownerId,listId,groupId);
      const ids=JSON.stringify(taskIds);
      const check=await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId)
        .input('ids',sql.NVarChar(sql.MAX),ids).query<{taskId:number}>(`
          SELECT task.id AS taskId FROM dbo.TM_tasks task WITH(UPDLOCK,HOLDLOCK)
          INNER JOIN OPENJSON(@ids) input ON task.id=TRY_CONVERT(bigint,input.[value])
          WHERE task.list_id=@list AND task.owner_user_id=@owner
            AND task.deleted_at_utc IS NULL AND task.kpi_instance_id IS NULL
            AND NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items m WHERE m.task_id=task.id)`);
      if(check.recordset.length!==taskIds.length)throw err('TASK_GROUP_BULK_INVALID','Some Tasks are not owned or cannot be moved.',403);
      await tx.request().input('owner',sql.Int,ownerId).input('list',sql.BigInt,listId)
        .input('ids',sql.NVarChar(sql.MAX),ids).input('group',sql.BigInt,groupId).query(`
          INSERT dbo.TM_task_activity(task_id,owner_user_id,actor_user_id,activity_type,event_data_json)
          SELECT task.id,@owner,@owner,'UPDATED',
            CONCAT('{"fromGroupId":',COALESCE(CONVERT(nvarchar(30),task.group_id),'null'),
              ',"toGroupId":',COALESCE(CONVERT(nvarchar(30),@group),'null'),'}')
          FROM dbo.TM_tasks task INNER JOIN OPENJSON(@ids) items ON task.id=TRY_CONVERT(bigint,items.[value])
          WHERE task.list_id=@list AND task.owner_user_id=@owner
            AND (task.group_id<>@group OR (task.group_id IS NULL AND @group IS NOT NULL) OR (task.group_id IS NOT NULL AND @group IS NULL));
          UPDATE task SET group_id=@group,updated_at_utc=SYSUTCDATETIME()
          FROM dbo.TM_tasks task INNER JOIN OPENJSON(@ids) items ON task.id=TRY_CONVERT(bigint,items.[value])
          WHERE task.list_id=@list AND task.owner_user_id=@owner;`);
    });
  },
  async moveTask(ownerId:number,taskId:number,groupId:number|null){
    await withTransaction(async tx=>{
      const r=await tx.request().input('owner',sql.Int,ownerId).input('task',sql.BigInt,taskId).query<{listId:number;groupId:number|null}>(`
        SELECT task.list_id AS listId,task.group_id AS groupId FROM dbo.TM_tasks task WITH(UPDLOCK,HOLDLOCK)
        WHERE task.id=@task AND task.owner_user_id=@owner AND task.list_id IS NOT NULL
          AND task.kpi_instance_id IS NULL AND task.deleted_at_utc IS NULL
          AND NOT EXISTS(SELECT 1 FROM dbo.TM_meeting_action_items m WHERE m.task_id=task.id)`);
      const task=r.recordset[0];if(!task)throw err('TASK_GROUP_TASK_NOT_FOUND','Normal Task not found or not owned.',404);
      await validParent(tx,ownerId,Number(task.listId),groupId);
      await tx.request().input('owner',sql.Int,ownerId).input('task',sql.BigInt,taskId)
        .input('group',sql.BigInt,groupId).query(`UPDATE dbo.TM_tasks SET group_id=@group,updated_at_utc=SYSUTCDATETIME()
          WHERE id=@task AND owner_user_id=@owner`);
      if(task.groupId!==groupId){
        await tx.request().input('owner',sql.Int,ownerId).input('task',sql.BigInt,taskId)
          .input('data',sql.NVarChar(sql.MAX),JSON.stringify({fromGroupId:task.groupId,toGroupId:groupId})).query(`
            INSERT dbo.TM_task_activity(task_id,owner_user_id,actor_user_id,activity_type,event_data_json)
            VALUES(@task,@owner,@owner,'UPDATED',@data)`);
      }
    });
  },
};
