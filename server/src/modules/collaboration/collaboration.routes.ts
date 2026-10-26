import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { verifyPortalJwt } from '../../middleware/verifyPortalJwt.middleware.js';
import { resolveTaskHubAccess } from '../../middleware/resolveTaskHubAccess.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { getValidatedRequestPart } from '../../shared/http/validated-request.js';
import { AppError } from '../../shared/errors/app-error.js';
import { sqlServerGuidSchema } from '../../shared/validation/sql-server-guid.schema.js';
import { uploadSingleAttachment } from '../task-details/attachment-upload.middleware.js';
import { collaborationService as service } from './collaboration.service.js';
import { collaborationPreviewMime } from './collaboration-preview.js';

const taskParams = z.object({taskId:z.coerce.number().int().positive()});
const childParams = taskParams.extend({subtaskId:z.coerce.number().int().positive()});
const assignmentParams = z.object({assignmentId:z.coerce.number().int().positive()});
const fileParams = z.object({fileId:sqlServerGuidSchema});
const assignees = z.object({userIds:z.array(z.number().int().positive()).min(1).max(30)});
const childAssignees = z.discriminatedUnion('mode', [
  z.object({mode:z.literal('INHERIT'),userIds:z.array(z.number().int().positive()).optional()}),
  z.object({mode:z.literal('CUSTOM'),userIds:z.array(z.number().int().positive()).min(1).max(30)}),
]);
const note = z.object({note:z.string().trim().min(1).max(4000)});
const completion = z.object({completed:z.boolean()});
function actor(req:{authContext?:{user:{userId:number}}}) {
  const id=req.authContext?.user.userId;
  if(!id) throw new AppError({statusCode:401,code:'AUTH_REQUIRED',message:'Authentication required.'});
  return id;
}
export const collaborationRouter:ExpressRouter=Router();
collaborationRouter.use(verifyPortalJwt,resolveTaskHubAccess);

collaborationRouter.get('/task/:taskId',validateRequest({params:taskParams}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof taskParams>>(req,'params');
  res.json({success:true,data:await service.view(actor(req),taskId)});
});
collaborationRouter.put('/task/:taskId/assignees',validateRequest({params:taskParams,body:assignees}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof taskParams>>(req,'params');
  const {userIds}=getValidatedRequestPart<z.infer<typeof assignees>>(req,'body');
  res.json({success:true,data:await service.setMainTeam(actor(req),taskId,userIds)});
});
collaborationRouter.put('/task/:taskId/subtasks/:subtaskId/assignees',
  validateRequest({params:childParams,body:childAssignees}),async(req,res)=>{
    const {taskId,subtaskId}=getValidatedRequestPart<z.infer<typeof childParams>>(req,'params');
    const input=getValidatedRequestPart<z.infer<typeof childAssignees>>(req,'body');
    res.json({success:true,data:await service.setChildTeam(actor(req),taskId,subtaskId,input.mode,input.userIds??[])});
  });
collaborationRouter.post('/assignments/:assignmentId/notes',
  validateRequest({params:assignmentParams,body:note}),async(req,res)=>{
    const {assignmentId}=getValidatedRequestPart<z.infer<typeof assignmentParams>>(req,'params');
    const {note:message}=getValidatedRequestPart<z.infer<typeof note>>(req,'body');
    res.status(201).json({success:true,data:await service.addNote(actor(req),assignmentId,message)});
  });
collaborationRouter.patch('/assignments/:assignmentId/completion',
  validateRequest({params:assignmentParams,body:completion}),async(req,res)=>{
    const {assignmentId}=getValidatedRequestPart<z.infer<typeof assignmentParams>>(req,'params');
    const {completed}=getValidatedRequestPart<z.infer<typeof completion>>(req,'body');
    res.json({success:true,data:await service.complete(actor(req),assignmentId,completed)});
  });
collaborationRouter.post('/assignments/:assignmentId/files',validateRequest({params:assignmentParams}),
  uploadSingleAttachment,async(req,res)=>{
    const {assignmentId}=getValidatedRequestPart<z.infer<typeof assignmentParams>>(req,'params');
    if(!req.file) throw new AppError({statusCode:400,code:'FILE_REQUIRED',message:'Choose one file.'});
    res.status(201).json({success:true,data:await service.upload(actor(req),assignmentId,req.file)});
  });
collaborationRouter.delete('/files/:fileId',validateRequest({params:fileParams}),async(req,res)=>{
  const {fileId}=getValidatedRequestPart<z.infer<typeof fileParams>>(req,'params');
  await service.removeFile(actor(req),fileId);
  res.status(204).send();
});
collaborationRouter.get('/files/:fileId/download',validateRequest({params:fileParams}),async(req,res)=>{
  const {fileId}=getValidatedRequestPart<z.infer<typeof fileParams>>(req,'params');
  const file=await service.download(actor(req),fileId);
  res.setHeader('Content-Type',file.mime);
  res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('Cache-Control','private, no-store');
  res.send(file.buffer);
});

// Same service-level membership and file permissions as the download endpoint.
// Only known inline-safe formats are exposed as browser previews.
collaborationRouter.get('/files/:fileId/preview',validateRequest({params:fileParams}),async(req,res)=>{
  const {fileId}=getValidatedRequestPart<z.infer<typeof fileParams>>(req,'params');
  const file=await service.download(actor(req),fileId);
  const mime=collaborationPreviewMime(file.name,file.buffer);
  res.setHeader('Content-Type',mime);
  res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','private, no-store');
  res.send(file.buffer);
});

