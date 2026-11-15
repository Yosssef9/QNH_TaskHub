import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { verifyPortalJwt } from '../../middleware/verifyPortalJwt.middleware.js';
import { resolveTaskHubAccess } from '../../middleware/resolveTaskHubAccess.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { getValidatedRequestPart } from '../../shared/http/validated-request.js';
import { AppError } from '../../shared/errors/app-error.js';
import { expectedFinishesService } from './expected-finishes.service.js';
import { isValidExpectedFinishDate } from './expected-finishes.policy.js';

const params=z.object({taskId:z.coerce.number().int().positive()});
const body=z.object({expectedFinishDate:z.string().nullable().refine(isValidExpectedFinishDate)}).strict();
function actor(req:{authContext?:{user:{userId:number}}}) {
  const id=req.authContext?.user.userId;
  if(!id) throw new AppError({statusCode:401,code:'AUTH_REQUIRED',message:'Authentication required.'});
  return id;
}
export const expectedFinishesRouter:ExpressRouter=Router();
expectedFinishesRouter.use(verifyPortalJwt,resolveTaskHubAccess);
expectedFinishesRouter.get('/task/:taskId',validateRequest({params}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  res.setHeader('Cache-Control','private, no-store');
  res.json({success:true,data:await expectedFinishesService.view(actor(req),taskId)});
});
expectedFinishesRouter.patch('/task/:taskId',validateRequest({params,body}),async(req,res)=>{
  const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
  const {expectedFinishDate}=getValidatedRequestPart<z.infer<typeof body>>(req,'body');
  res.json({success:true,data:await expectedFinishesService.update(actor(req),{taskId,subtaskId:null},expectedFinishDate)});
});
const childParams=params.extend({subtaskId:z.coerce.number().int().positive()});
expectedFinishesRouter.patch('/task/:taskId/subtask/:subtaskId',validateRequest({params:childParams,body}),async(req,res)=>{
  const {taskId,subtaskId}=getValidatedRequestPart<z.infer<typeof childParams>>(req,'params');
  const {expectedFinishDate}=getValidatedRequestPart<z.infer<typeof body>>(req,'body');
  res.json({success:true,data:await expectedFinishesService.update(actor(req),{taskId,subtaskId},expectedFinishDate)});
});
