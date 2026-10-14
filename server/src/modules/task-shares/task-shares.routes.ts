import { Router,type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { verifyPortalJwt } from '../../middleware/verifyPortalJwt.middleware.js';
import { resolveTaskHubAccess } from '../../middleware/resolveTaskHubAccess.middleware.js';
import { getValidatedRequestPart } from '../../shared/http/validated-request.js';
import { AppError } from '../../shared/errors/app-error.js';
import { taskSharesService } from './task-shares.service.js';

const params=z.object({taskId:z.coerce.number().int().positive()});
const recipient=z.object({taskId:z.coerce.number().int().positive(),recipientId:z.coerce.number().int().positive()});
const payload=z.object({ recipients:z.array(z.object({userId:z.number().int().positive(),permission:z.enum(['VIEW','EDIT'])})).max(30) });
const listQuery=z.object({
 tab:z.enum(['with','by']).default('with'),search:z.string().trim().max(100).default(''),
 page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),
 personId:z.coerce.number().int().positive().optional(),
 permission:z.enum(['ALL','VIEW','EDIT']).default('ALL'),
 status:z.enum(['ALL','TODO','IN_PROGRESS','DONE','CANCELLED']).default('ALL'),
 priority:z.enum(['ALL','LOW','MEDIUM','HIGH']).default('ALL'),
 taskType:z.enum(['ALL','TEAM','SINGLE','PERSONAL']).default('ALL'),
 due:z.enum(['ALL','OVERDUE','TODAY','UPCOMING','NO_DATE']).default('ALL'),
 sortBy:z.enum(['createdAt','dueDate','priority','title','status']).default('createdAt'),
 sortDirection:z.enum(['asc','desc']).default('desc'),
 tagIds:z.string().regex(/^\d+(,\d+)*$/).max(240).optional(),
 tagMatch:z.enum(['ANY','ALL','UNTAGGED']).default('ANY'),
});
const peopleQuery=z.object({tab:z.enum(['with','by']).default('with')});
function actor(req: {authContext?:{user:{userId:number}}}) {
 const id=req.authContext?.user.userId;
 if(!id)throw new AppError({statusCode:401,code:'UNAUTHENTICATED',message:'Sign in required.'});
 return id;
}
export const taskSharesRouter:ExpressRouter=Router();
taskSharesRouter.use(verifyPortalJwt,resolveTaskHubAccess);
taskSharesRouter.get('/',validateRequest({query:listQuery}),async(req,res)=>{
 const input=getValidatedRequestPart<z.infer<typeof listQuery>>(req,'query');
 res.json({success:true,data:await taskSharesService.list(actor(req),input)});
});
taskSharesRouter.get('/people',validateRequest({query:peopleQuery}),async(req,res)=>{
 const {tab}=getValidatedRequestPart<z.infer<typeof peopleQuery>>(req,'query');
 res.json({success:true,data:await taskSharesService.people(actor(req),tab)});
});
taskSharesRouter.get('/:taskId',validateRequest({params}),async(req,res)=>{
 const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
 res.json({success:true,data:await taskSharesService.recipients(actor(req),taskId)});
});
taskSharesRouter.put('/:taskId',validateRequest({params,body:payload}),async(req,res)=>{
 const {taskId}=getValidatedRequestPart<z.infer<typeof params>>(req,'params');
 const {recipients}=getValidatedRequestPart<z.infer<typeof payload>>(req,'body');
 await taskSharesService.upsert(actor(req),taskId,recipients);
 res.json({success:true,data:await taskSharesService.recipients(actor(req),taskId)});
});
taskSharesRouter.delete('/:taskId/:recipientId',validateRequest({params:recipient}),async(req,res)=>{
 const {taskId,recipientId}=getValidatedRequestPart<z.infer<typeof recipient>>(req,'params');
 await taskSharesService.revoke(actor(req),taskId,recipientId);
 res.status(204).send();
});

