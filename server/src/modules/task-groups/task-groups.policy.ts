import { AppError } from '../../shared/errors/app-error.js';

export type GroupRelation = { id:number; parentGroupId:number|null };

export function assertNoGroupCycle(rows:Pick<GroupRelation,'id'|'parentGroupId'>[],groupId:number,nextParentId:number|null){
  const parents=new Map(rows.map(row=>[Number(row.id),row.parentGroupId===null?null:Number(row.parentGroupId)]));
  if(!parents.has(groupId))throw new AppError({statusCode:404,code:'TASK_GROUP_NOT_FOUND',message:'Group not found.'});
  const visited=new Set<number>();
  let cursor=nextParentId;
  while(cursor!==null){
    if(cursor===groupId || visited.has(cursor))throw new AppError({statusCode:400,code:'TASK_GROUP_CYCLE',message:'Cannot move a group into itself or its descendant.'});
    visited.add(cursor);
    if(!parents.has(cursor))throw new AppError({statusCode:400,code:'TASK_GROUP_PARENT_INVALID',message:'Parent group does not exist in this List.'});
    cursor=parents.get(cursor)!;
  }
}

/**
 * A SQL Server BIGINT may arrive as either a number or a numeric string.
 * The request schema uses numeric IDs, so normalize stored identifiers before
 * comparing the selected parent and validating its complete sibling ordering.
 */
export function assertCompleteSiblingReorder(
  rows: ReadonlyArray<{id:number|string;parentGroupId:number|string|null}>,
  parentGroupId:number|null,
  groupIds:readonly number[],
):void {
  const siblings=rows
    .filter(row=>(row.parentGroupId===null?null:Number(row.parentGroupId))===parentGroupId)
    .map(row=>Number(row.id));
  if(siblings.length!==groupIds.length || new Set(groupIds).size!==siblings.length ||
     !groupIds.every(id=>siblings.includes(id))) {
    throw new AppError({
      statusCode:409,
      code:'TASK_GROUP_REORDER_INVALID',
      message:'All siblings must be included in the new order.',
    });
  }
}
