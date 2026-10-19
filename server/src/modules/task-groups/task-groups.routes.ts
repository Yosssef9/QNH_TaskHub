import { Router, type Router as ExpressRouter, type Request } from 'express';
import { verifyPortalJwt } from '../../middleware/verifyPortalJwt.middleware.js';
import { resolveTaskHubAccess } from '../../middleware/resolveTaskHubAccess.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { getValidatedRequestPart } from '../../shared/http/validated-request.js';
import { taskGroupsService } from './task-groups.service.js';
import { taskGroupListQuerySchema, type TaskGroupListQuery } from './task-groups.schemas.js';
import {
  groupListParamsSchema,groupParamsSchema,taskGroupTaskParamsSchema,
  createGroupBodySchema,updateGroupBodySchema,moveTaskGroupBodySchema,reorderGroupsBodySchema,bulkMoveTasksBodySchema,
} from './task-groups.schemas.js';

function actor(req:Request){
  const userId=req.authContext?.user.userId;
  if(!userId)throw new AppError({statusCode:401,code:'AUTH_CONTEXT_MISSING',message:'Authentication required.'});
  return userId;
}
export const taskGroupsListRouter:ExpressRouter=Router();
taskGroupsListRouter.use(verifyPortalJwt,resolveTaskHubAccess);
taskGroupsListRouter.get('/:listId/groups',validateRequest({params:groupListParamsSchema,query:taskGroupListQuerySchema}),async(req,res)=>{
  const {listId}=getValidatedRequestPart<{listId:number}>(req,'params');
  const filters=getValidatedRequestPart<TaskGroupListQuery>(req,'query');
  res.json({success:true,data:await taskGroupsService.list(actor(req),listId,filters)});
});
taskGroupsListRouter.post('/:listId/groups',validateRequest({params:groupListParamsSchema,body:createGroupBodySchema}),async(req,res)=>{
  const {listId}=getValidatedRequestPart<{listId:number}>(req,'params');
  const input=getValidatedRequestPart<{name:string;parentGroupId:number|null}>(req,'body');
  res.status(201).json({success:true,data:await taskGroupsService.create(actor(req),listId,input)});
});
taskGroupsListRouter.patch('/:listId/groups/tasks/bulk',validateRequest({params:groupListParamsSchema,body:bulkMoveTasksBodySchema}),async(req,res)=>{
  const {listId}=getValidatedRequestPart<{listId:number}>(req,'params');
  const {taskIds,groupId}=getValidatedRequestPart<{taskIds:number[];groupId:number|null}>(req,'body');
  await taskGroupsService.bulkMove(actor(req),listId,taskIds,groupId);
  res.status(204).end();
});
taskGroupsListRouter.put('/:listId/groups/order',validateRequest({params:groupListParamsSchema,body:reorderGroupsBodySchema}),async(req,res)=>{
  const {listId}=getValidatedRequestPart<{listId:number}>(req,'params');
  const {parentGroupId,groupIds}=getValidatedRequestPart<{parentGroupId:number|null;groupIds:number[]}>(req,'body');
  await taskGroupsService.reorder(actor(req),listId,parentGroupId,groupIds);
  res.status(204).end();
});
taskGroupsListRouter.patch('/:listId/groups/:groupId',validateRequest({params:groupParamsSchema,body:updateGroupBodySchema}),async(req,res)=>{
  const {listId,groupId}=getValidatedRequestPart<{listId:number;groupId:number}>(req,'params');
  const input=getValidatedRequestPart<{name?:string;parentGroupId?:number|null;displayOrder?:number}>(req,'body');
  res.json({success:true,data:await taskGroupsService.update(actor(req),listId,groupId,input)});
});
taskGroupsListRouter.delete('/:listId/groups/:groupId',validateRequest({params:groupParamsSchema}),async(req,res)=>{
  const {listId,groupId}=getValidatedRequestPart<{listId:number;groupId:number}>(req,'params');
  await taskGroupsService.remove(actor(req),listId,groupId);
  res.status(204).end();
});
export const taskGroupTaskRouter:ExpressRouter=Router();
taskGroupTaskRouter.use(verifyPortalJwt,resolveTaskHubAccess);
taskGroupTaskRouter.patch('/:taskId/group',validateRequest({params:taskGroupTaskParamsSchema,body:moveTaskGroupBodySchema}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<{taskId:number}>(req,'params');
  const {groupId}=getValidatedRequestPart<{groupId:number|null}>(req,'body');
  await taskGroupsService.moveTask(actor(req),taskId,groupId);
  res.json({success:true,data:{taskId,groupId}});
});
