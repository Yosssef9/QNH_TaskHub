import { Router, type Router as ExpressRouter } from "express";
import { verifyPortalJwt } from "../../middleware/verifyPortalJwt.middleware.js";
import { resolveTaskHubAccess } from "../../middleware/resolveTaskHubAccess.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { getValidatedRequestPart } from "../../shared/http/validated-request.js";
import { AppError } from "../../shared/errors/app-error.js";
import { listGeneralAssignments, listGeneralEligibleUsers, findEligibleGeneralTaskUser } from "./general-task-assignments.repository.js";
import { generalTaskAssignmentsService as service } from "./general-task-assignments.service.js";
import {
  generalTaskIdSchema, generalSubtaskIdSchema, generalAssignmentBodySchema,
  workNotesBodySchema, completionSummaryBodySchema,
} from "./general-task-assignments.schemas.js";

export const generalTaskAssignmentsRouter: ExpressRouter = Router();
generalTaskAssignmentsRouter.use(verifyPortalJwt, resolveTaskHubAccess);
function actor(req: {authContext?:{user:{userId:number}}}): number {
  const id=req.authContext?.user.userId;
  if (!id) throw new AppError({statusCode:500,code:"AUTH_CONTEXT_MISSING",message:"Authentication required."});
  return id;
}

generalTaskAssignmentsRouter.put("/task/:taskId/assignee",
  validateRequest({params:generalTaskIdSchema,body:generalAssignmentBodySchema}), async(req,res)=>{
    const {taskId}=getValidatedRequestPart<{taskId:number}>(req,"params");
    const {assigneeUserId}=getValidatedRequestPart<{assigneeUserId:number|null}>(req,"body");
    res.json({success:true,data:await service.assignMain(actor(req),taskId,assigneeUserId)});
  });
generalTaskAssignmentsRouter.put("/subtask/:subtaskId/assignee",
  validateRequest({params:generalSubtaskIdSchema,body:generalAssignmentBodySchema}), async(req,res)=>{
    const {subtaskId}=getValidatedRequestPart<{subtaskId:number}>(req,"params");
    const {assigneeUserId}=getValidatedRequestPart<{assigneeUserId:number|null}>(req,"body");
    res.json({success:true,data:await service.assignSubtask(actor(req),subtaskId,assigneeUserId)});
  });
generalTaskAssignmentsRouter.patch("/subtask/:subtaskId/work-notes",
  validateRequest({params:generalSubtaskIdSchema,body:workNotesBodySchema}),async(req,res)=>{
    const {subtaskId}=getValidatedRequestPart<{subtaskId:number}>(req,"params");
    const {workNotes}=getValidatedRequestPart<{workNotes:string|null}>(req,"body");
    res.json({success:true,data:await service.saveWorkNotes(actor(req),subtaskId,workNotes)});
  });
generalTaskAssignmentsRouter.patch("/task/:taskId/completion-summary",
  validateRequest({params:generalTaskIdSchema,body:completionSummaryBodySchema}),async(req,res)=>{
    const {taskId}=getValidatedRequestPart<{taskId:number}>(req,"params");
    const {completionSummary}=getValidatedRequestPart<{completionSummary:string|null}>(req,"body");
    res.json({success:true,data:await service.saveCompletionSummary(actor(req),taskId,completionSummary)});
  });

// Actor-scoped lookup: do not expose all Portal accounts without active TaskHub access.
import { z } from "zod";
import { TASK_STATUSES, TASK_PRIORITIES } from "../tasks/tasks.constants.js";
const searchSchema=z.object({search:z.string().trim().max(100).default(""),
  page:z.coerce.number().int().min(1).default(1),
  pageSize:z.coerce.number().int().min(1).max(50).default(20)});
generalTaskAssignmentsRouter.get("/eligible-users",validateRequest({query:searchSchema}),async(req,res)=>{
  const query=getValidatedRequestPart<{search:string;page:number;pageSize:number}>(req,"query");
  res.json({success:true,data:await listGeneralEligibleUsers(actor(req),query.search,query.page,query.pageSize)});
});
const assignedSearchSchema=searchSchema.extend({
  status:z.enum(TASK_STATUSES).optional(),priority:z.enum(TASK_PRIORITIES).optional(),
  due:z.enum(["ALL","OVERDUE","TODAY","UPCOMING","NO_DATE"]).default("ALL"),
  sortBy:z.enum(["assignedAt","dueDate","priority","title","status"]).default("assignedAt"),
  sortDirection:z.enum(["asc","desc"]).default("desc"),
});
generalTaskAssignmentsRouter.get("/assigned",validateRequest({query:assignedSearchSchema}),async(req,res)=>{
  const query=getValidatedRequestPart<z.infer<typeof assignedSearchSchema>>(req,"query");
  res.json({success:true,data:await listGeneralAssignments(actor(req),query.page,query.pageSize,query.search,{status:query.status,priority:query.priority,due:query.due,sortBy:query.sortBy,sortDirection:query.sortDirection})});
});

generalTaskAssignmentsRouter.get('/eligible-users/:userId',
  validateRequest({params:z.object({userId:z.coerce.number().int().positive()})}),async(req,res)=>{
    const {userId}=getValidatedRequestPart<{userId:number}>(req,'params');
    const user=await findEligibleGeneralTaskUser(userId);
    if(!user) throw new AppError({statusCode:404,code:'TASK_ASSIGNEE_INVALID',message:'Assignee not found.'});
    res.json({success:true,data:user});
  });
