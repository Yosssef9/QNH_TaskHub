import { Router, type Router as ExpressRouter } from "express";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { getDashboard } from "./dashboard.controller.js";
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { getValidatedRequestPart } from '../../shared/http/validated-request.js';
import { dashboardWorkRepository } from './dashboard-work.repository.js';
import { dashboardActivityRepository } from './dashboard-activity.repository.js';
import { dashboardListsRepository } from './dashboard-lists.repository.js';
import { AppError } from '../../shared/errors/app-error.js';
const workQuery = z.object({
  tab: z.enum(['attention','assigned','shared','personal','delegated']).default('attention'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).default(''),
  status: z.enum(['ACTIVE','ALL','TODO','IN_PROGRESS','DONE','CANCELLED']).default('ACTIVE'),
  priority: z.enum(['ALL','LOW','MEDIUM','HIGH']).default('ALL'),
  due: z.enum(['ALL','OVERDUE','TODAY','UPCOMING','NO_DATE']).default('ALL'),
  sort: z.enum(['urgency','created','due','priority']).default('urgency'),
});

export const dashboardRouter: ExpressRouter = Router();
dashboardRouter.use(verifyPortalJwt, resolveTaskHubAccess);
dashboardRouter.get('/list-summaries',async(req,res)=>{
  const actor=req.authContext?.user.userId;
  if(!actor)throw new AppError({statusCode:401,code:'UNAUTHENTICATED',message:'Sign in required.'});
  res.json({success:true,data:await dashboardListsRepository.summaries(actor)});
});
dashboardRouter.get('/activity',async(req,res)=>{
  const actor=req.authContext?.user.userId;
  if(!actor)throw new AppError({statusCode:401,code:'UNAUTHENTICATED',message:'Sign in required.'});
  res.json({success:true,data:await dashboardActivityRepository.recent(actor)});
});
dashboardRouter.get('/work',validateRequest({query:workQuery}),async(req,res)=>{
  const actor=req.authContext?.user.userId;
  if(!actor)throw new AppError({statusCode:401,code:'UNAUTHENTICATED',message:'Sign in required.'});
  const query=getValidatedRequestPart<z.infer<typeof workQuery>>(req,'query');
  res.json({success:true,data:await dashboardWorkRepository.list(actor,query)});
});
dashboardRouter.get("/", getDashboard);
