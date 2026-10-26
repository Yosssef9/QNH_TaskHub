import { Router, type Request } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { verifyPortalJwt } from '../../middleware/verifyPortalJwt.middleware.js';
import { resolveTaskHubAccess } from '../../middleware/resolveTaskHubAccess.middleware.js';
import { getValidatedRequestPart } from '../../shared/http/validated-request.js';
import { sqlServerGuidSchema } from '../../shared/validation/sql-server-guid.schema.js';
import { uploadSingleAttachment } from '../task-details/attachment-upload.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { taskDiscussionsService as service } from './task-discussions.service.js';
import { assertDiscussionAccess } from './task-discussions.policy.js';
import { subscribeToDiscussion, publishDiscussionEvent } from './task-discussions.stream.js';
import { listDiscussionMembers } from './task-discussions.notifications.js';
import { DISCUSSION_REACTIONS } from './task-discussions.reactions.js';

const params=z.object({taskId:z.coerce.number().int().positive()});
const messageParams=z.object({messageId:z.coerce.number().int().positive()});
const fileParams=z.object({fileId:sqlServerGuidSchema});
const scopeQuery=z.object({subtaskId:z.coerce.number().int().positive().optional()});
const listQuery=scopeQuery.extend({beforeId:z.coerce.number().int().positive().optional()});
const sendSchema=z.object({body:z.string().trim().min(1).max(4000),
  clientRequestId:z.uuid(),replyToMessageId:z.number().int().positive().nullable().optional()});
const editSchema=z.object({body:z.string().trim().min(1).max(4000)});
const readSchema=z.object({lastMessageId:z.number().int().nonnegative()});
const searchQuery=scopeQuery.extend({q:z.string().trim().min(2).max(120)});
const reactionSchema=z.object({emoji:z.enum(DISCUSSION_REACTIONS),active:z.boolean()});
function actor(req:Request){const id=req.authContext?.user.userId;
  if(!id) throw new AppError({statusCode:401,code:'AUTH_REQUIRED',message:'Authentication required.'});
  return id;
}
export const taskDiscussionsRouter: ReturnType<typeof Router> = Router();
taskDiscussionsRouter.use(verifyPortalJwt,resolveTaskHubAccess);
taskDiscussionsRouter.get('/inbox/unread-total',async(req,res)=>{
  res.json({success:true,data:{unread:await service.unreadTotal(actor(req))}});
});
taskDiscussionsRouter.get('/inbox',validateRequest({query:z.object({
  beforeId:z.coerce.number().int().positive().optional(),limit:z.coerce.number().int().min(1).max(40).default(25),
  filter:z.enum(['all','unread','mentions']).default('all'),
})}),async(req,res)=>{
  const query=getValidatedRequestPart<{beforeId?:number;limit:number;filter:'all'|'unread'|'mentions'}>(req,'query');
  res.json({success:true,data:await service.inbox(actor(req),query)});
});
taskDiscussionsRouter.get('/unread',validateRequest({query:z.object({taskIds:z.string().max(1200)})}),async(req,res)=>{
  const {taskIds}=getValidatedRequestPart<{taskIds:string}>(req,'query');
  const ids=[...new Set(taskIds.split(',').map(v=>Number(v)))];
  if(ids.length>75 || ids.some(v=>!Number.isSafeInteger(v)||v<=0))
    throw new AppError({statusCode:400,code:'DISCUSSION_IDS_INVALID',message:'Invalid task ID list.'});
  res.json({success:true,data:await service.unreadForTasks(actor(req),ids)});
});
taskDiscussionsRouter.get('/:taskId/scopes',validateRequest({params}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  res.json({success:true,data:await service.scopes(actor(req),taskId)});
});
taskDiscussionsRouter.get('/:taskId/members',validateRequest({params,query:scopeQuery}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {subtaskId}=getValidatedRequestPart<z.infer<typeof scopeQuery>>(req,'query');
  res.json({success:true,data:await listDiscussionMembers(actor(req),{taskId,subtaskId:subtaskId??null})});
});
taskDiscussionsRouter.get('/:taskId/messages',validateRequest({params,query:listQuery}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {subtaskId,beforeId}=getValidatedRequestPart<z.infer<typeof listQuery>>(req,'query');
  res.json({success:true,data:await service.list(actor(req),{taskId,subtaskId:subtaskId??null},beforeId)});
});
taskDiscussionsRouter.get('/:taskId/search',validateRequest({params,query:searchQuery}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {subtaskId,q}=getValidatedRequestPart<z.infer<typeof searchQuery>>(req,'query');
  res.json({success:true,data:await service.search(actor(req),{taskId,subtaskId:subtaskId??null},q)});
});
taskDiscussionsRouter.put('/messages/:messageId/reactions',validateRequest({params:messageParams,body:reactionSchema}),async(req,res)=>{
  const {messageId}=getValidatedRequestPart<z.infer<typeof messageParams>>(req,'params');
  const {emoji,active}=getValidatedRequestPart<z.infer<typeof reactionSchema>>(req,'body');
  await service.react(actor(req),messageId,emoji,active);res.status(204).send();
});
taskDiscussionsRouter.post('/:taskId/messages',validateRequest({params,query:scopeQuery,body:sendSchema}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {subtaskId}=getValidatedRequestPart<z.infer<typeof scopeQuery>>(req,'query');
  const input=getValidatedRequestPart<z.infer<typeof sendSchema>>(req,'body');
  const sendInput={body:input.body,clientRequestId:input.clientRequestId,
    ...(input.replyToMessageId===undefined?{}:{replyToMessageId:input.replyToMessageId})};
  const result=await service.send(actor(req),{taskId,subtaskId:subtaskId??null},sendInput);
  res.status(201).json({success:true,data:result});
});
taskDiscussionsRouter.patch('/messages/:messageId',validateRequest({params:messageParams,body:editSchema}),async(req,res)=>{
  const {messageId}=getValidatedRequestPart<z.infer<typeof messageParams>>(req,'params');
  const {body}=getValidatedRequestPart<z.infer<typeof editSchema>>(req,'body');
  await service.edit(actor(req),messageId,body);res.status(204).send();
});
taskDiscussionsRouter.delete('/messages/:messageId',validateRequest({params:messageParams}),async(req,res)=>{
  const {messageId}=getValidatedRequestPart<z.infer<typeof messageParams>>(req,'params');
  await service.remove(actor(req),messageId);res.status(204).send();
});
taskDiscussionsRouter.post('/:taskId/typing',validateRequest({params,query:scopeQuery,body:z.object({typing:z.boolean()})}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {subtaskId}=getValidatedRequestPart<z.infer<typeof scopeQuery>>(req,'query');
  const {typing}=getValidatedRequestPart<{typing:boolean}>(req,'body');
  const scope={taskId,subtaskId:subtaskId??null};
  await assertDiscussionAccess(actor(req),scope,true);
  publishDiscussionEvent(scope,'typing',{userId:actor(req),typing});
  res.status(204).send();
});
taskDiscussionsRouter.post('/:taskId/read',validateRequest({params,query:scopeQuery,body:readSchema}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {subtaskId}=getValidatedRequestPart<z.infer<typeof scopeQuery>>(req,'query');
  const {lastMessageId}=getValidatedRequestPart<z.infer<typeof readSchema>>(req,'body');
  await service.markRead(actor(req),{taskId,subtaskId:subtaskId??null},lastMessageId);
  res.status(204).send();
});
taskDiscussionsRouter.post('/messages/:messageId/files',validateRequest({params:messageParams}),uploadSingleAttachment,async(req,res)=>{
  const {messageId}=getValidatedRequestPart<z.infer<typeof messageParams>>(req,'params');
  if(!req.file) throw new AppError({statusCode:400,code:'FILE_REQUIRED',message:'File required.'});
  res.status(201).json({success:true,data:await service.upload(actor(req),messageId,req.file)});
});
async function respondFile(req:Request,res:import('express').Response,download:boolean){
  const {fileId}=getValidatedRequestPart<z.infer<typeof fileParams>>(req,'params');
  const result=await service.file(actor(req),fileId);
  const previewable=/^(image\/(png|jpeg|webp)|application\/pdf|text\/plain)$/i.test(result.mime);
  res.setHeader('Content-Type',download || !previewable ? 'application/octet-stream' : result.mime);
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Disposition',`${download || !previewable?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(result.name)}`);
  res.send(result.buffer);
}
taskDiscussionsRouter.delete('/files/:fileId',validateRequest({params:fileParams}),async(req,res)=>{
  const {fileId}=getValidatedRequestPart<z.infer<typeof fileParams>>(req,'params');
  await service.removeFile(actor(req),fileId);res.status(204).send();
});
taskDiscussionsRouter.get('/files/:fileId/preview',validateRequest({params:fileParams}),async(req,res)=>respondFile(req,res,false));
taskDiscussionsRouter.get('/files/:fileId/download',validateRequest({params:fileParams}),async(req,res)=>respondFile(req,res,true));
taskDiscussionsRouter.get('/:taskId/live',validateRequest({params,query:scopeQuery}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {subtaskId}=getValidatedRequestPart<z.infer<typeof scopeQuery>>(req,'query');
  const scope={taskId,subtaskId:subtaskId??null};
  await assertDiscussionAccess(actor(req),scope);
  res.status(200).setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders();res.write(': connected\n\n');
  subscribeToDiscussion(actor(req),scope,res);
});
