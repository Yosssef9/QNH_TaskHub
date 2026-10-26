import path from 'node:path';
import { cleanUploadedAttachmentFileName, recoverAttachmentFileName } from '../../shared/utils/attachment-filename.js';
import { withTransaction } from '../../database/transaction.js';
import type { DatabaseTransaction } from '../../database/types.js';
import { AppError } from '../../shared/errors/app-error.js';
import { assertTaskWritable } from '../tasks/tasks.policy.js';
import { tasksRepository } from '../tasks/tasks.repository.js';
import { storeAttachment, readAttachment, removeStoredAttachment } from '../task-details/attachment-storage.js';
import { taskDetailsRepository } from '../task-details/task-details.repository.js';
import { generalTaskAssignmentsRepository } from '../general-task-assignments/general-task-assignments.repository.js';
import { notifyGeneralTask,notifyRemovedAssignment } from '../general-task-assignments/general-task-assignments.email-events.js';
import { collaborationRepository as repo, type CollaborativeTaskRow,
  type CollaborativeAssignmentRow } from './collaboration.repository.js';
import { canDeleteCollaborativeEvidence, normalizeCollaborators, reconcileInheritedTeam } from './collaboration.policy.js';

const notFound = () => new AppError({statusCode:404,code:'COLLABORATION_NOT_FOUND',message:'Assignment not found.'});
const denied = () => new AppError({statusCode:403,code:'COLLABORATION_FORBIDDEN',message:'You cannot access this assignment.'});
const inactive = () => new AppError({statusCode:409,code:'COLLABORATION_INACTIVE',message:'This assignment is no longer active.'});

async function lockTask(actorId:number,taskId:number,transaction:DatabaseTransaction,ownerOnly=false) {
  const context=await repo.task(taskId,transaction);
  if (!context || context.kpiInstanceId!==null) throw notFound();
  if (ownerOnly && context.ownerUserId!==actorId) throw denied();
  const task=await tasksRepository.findOwnedForUpdate(transaction,context.ownerUserId,taskId);
  if (!task) throw notFound();
  assertTaskWritable(task);
  if (task.status==='CANCELLED') throw inactive();
  if (context.meetingId!==null && context.ownerUserId!==actorId &&
      !(await repo.meetingEligible(actorId,context.meetingId,
        context.meetingOrganizerUserId??context.ownerUserId,transaction))) throw denied();
  return {context,task};
}
async function validateTeam(context:CollaborativeTaskRow,userIds:number[],transaction:DatabaseTransaction){
  for (const id of userIds) {
    if (!(await repo.activeUser(id,transaction))) throw new AppError({statusCode:400,
      code:'COLLABORATION_ASSIGNEE_INVALID',message:'Only active TaskHub users can be assigned.'});
    if (context.meetingId!==null && !(await repo.meetingEligible(id,context.meetingId,
        context.meetingOrganizerUserId ?? context.ownerUserId,transaction))) {
      throw new AppError({statusCode:400,code:'COLLABORATION_MEETING_ASSIGNEE_INVALID',
        message:'Meeting assignments require eligible Meeting attendees.'});
    }
  }
}
async function syncMembers(transaction:DatabaseTransaction,context:CollaborativeTaskRow,subtaskId:number|null,
  desiredIds:number[],actorId:number,old:CollaborativeAssignmentRow[],origin:'EXPLICIT'|'INHERITED',
  preserveCompletionForUserId:number|null=null,oldCompleted=false){
  const taskId=context.taskId;
  const current=old.filter(row=>row.subtaskId===subtaskId);
  const {add,remove}=reconcileInheritedTeam(desiredIds,current.map(row=>row.assigneeUserId));
  for (const row of current.filter(item=>remove.includes(item.assigneeUserId))) {
    await repo.revokeAssignment(row.id,actorId,transaction);
    await notifyRemovedAssignment(transaction,actorId,row.assigneeUserId,taskId,subtaskId);
  }
  for (const userId of add) {
    await repo.addAssignment(taskId,subtaskId,userId,origin,actorId,transaction,
      oldCompleted && preserveCompletionForUserId===userId);
    await notifyGeneralTask(transaction,[userId],actorId,{
      type:subtaskId===null?'GENERAL_TASK_ASSIGNED':'GENERAL_SUBTASK_ASSIGNED',
      taskId,subtaskId,listId:context.meetingId===null?context.listId:null,
      subjectTitle:context.title,contextTitle:context.meetingTitle??'Collaborative Task assigned to you',
    });
  }
}
async function recalculate(taskId:number,actorId:number,transaction:DatabaseTransaction){
  const before=await repo.task(taskId,transaction);
  await repo.syncChildStatus(taskId,transaction,actorId);
  await repo.syncParentStatus(taskId,transaction,actorId);
  const after=await repo.task(taskId,transaction);
  if(!before||!after||before.status===after.status) return;
  if(after.status!=='DONE' && before.status!=='DONE') return;
  const recipients=(await repo.activeAssignments(taskId,transaction))
    .filter(member=>member.subtaskId===null).map(member=>member.assigneeUserId);
  await notifyGeneralTask(transaction,[after.ownerUserId,...recipients],actorId,{
    type:after.status==='DONE'?'GENERAL_TASK_COMPLETED':'GENERAL_TASK_REOPENED',
    taskId,listId:after.listId,taskOwnerUserId:after.ownerUserId,
    subjectTitle:after.title,contextTitle:after.meetingTitle??'Collaborative Task updated',
  });
}

/** Activate a freshly-created task as collaborative in the caller's creation
 * transaction. The task and its full membership commit or roll back together.
 */
export async function initializeCollaborativeTask(
  transaction:DatabaseTransaction, ownerId:number, taskId:number, userIds:number[],
):Promise<void>{
  const selected=normalizeCollaborators(userIds);
  if (selected.length<1 || selected.length>30) throw new AppError({statusCode:400,
    code:'COLLABORATION_TEAM_SIZE',message:'Choose between 1 and 30 assignees.'});
  const context=await repo.task(taskId,transaction);
  if (!context || context.ownerUserId!==ownerId || context.kpiInstanceId!==null || context.isCollaborative) throw notFound();
  await validateTeam(context,selected,transaction);
  if (context.meetingId===null) await generalTaskAssignmentsRepository.ensureRelation(
    transaction,taskId,ownerId,ownerId,null);
  await repo.activate(taskId,ownerId,transaction);
  await tasksRepository.addActivity(transaction,ownerId,taskId,'COLLAB_ENABLED',
    {assigneeCount:selected.length},ownerId);
  for (const userId of selected) {
    await repo.addAssignment(taskId,null,userId,'EXPLICIT',ownerId,transaction);
    await notifyGeneralTask(transaction,[userId],ownerId,{
      type:'GENERAL_TASK_ASSIGNED',taskId,listId:context.meetingId===null?context.listId:null,
      subjectTitle:context.title,contextTitle:context.meetingTitle??'Collaborative Task assigned to you',
    });
  }
  await recalculate(taskId,ownerId,transaction);
}

/** Used by Meeting Action Item updates to commit membership with metadata and audit atomically. */
export async function setCollaborativeMainTeamInTransaction(
  actorId: number, taskId: number, inputIds: number[], transaction: DatabaseTransaction,
): Promise<void> {
  const selected = normalizeCollaborators(inputIds);
  if (selected.length === 0 || selected.length > 30) throw new AppError({statusCode:400,
    code:'COLLABORATION_TEAM_SIZE',message:'Choose between 1 and 30 users.'});

      const {context,task}=await lockTask(actorId,taskId,transaction,true);
      await validateTeam(context,selected,transaction);
      if (!context.isCollaborative && task.status==='DONE') throw new AppError({statusCode:409,
        code:'COLLABORATION_COMPLETED_TASK',
        message:'Reopen the completed Task before converting it to collaborative assignments.'});
      if (!context.isCollaborative) {
        if (context.meetingId===null) await generalTaskAssignmentsRepository.ensureRelation(
          transaction,taskId,context.ownerUserId,actorId,null);
        await repo.activate(taskId,actorId,transaction);
        await tasksRepository.addActivity(transaction,context.ownerUserId,taskId,'COLLAB_ENABLED',
          {assigneeCount:selected.length},actorId);
        await repo.ensureChildModes(taskId,actorId,transaction);
      }
      const old=await repo.activeAssignments(taskId,transaction);
      await syncMembers(transaction,context,null,selected,actorId,old,'EXPLICIT');
      const updated=await repo.activeAssignments(taskId,transaction);
      const childModes=await repo.childModes(taskId,transaction);
      for (const child of childModes) {
        const desired=child.mode==='INHERIT' ? selected :
          (context.isCollaborative ? null : child.legacyAssigneeUserId===null ? selected :[child.legacyAssigneeUserId]);
        if (desired!==null) await syncMembers(transaction,context,child.subtaskId,desired,actorId,
          updated,'INHERITED',child.legacyAssigneeUserId??context.oldMainAssigneeUserId??context.ownerUserId,
          child.isCompleted);
      }
      await recalculate(taskId,actorId,transaction);
}

export const collaborationService={
  async view(actorId:number,taskId:number){
    const task=await repo.task(taskId);
    if (!task || task.kpiInstanceId!==null) throw notFound();
    if (!task.isCollaborative) {
      if (task.ownerUserId!==actorId) throw notFound();
      return {enabled:false,canManage:true,members:[],notes:[],files:[],modes:[],progress:[]};
    }
    if (task.ownerUserId!==actorId && !(await repo.isAssigned(taskId,actorId))) throw notFound();
    return {enabled:true,canManage:task.ownerUserId===actorId,
      ...(await repo.snapshot(taskId,actorId,task.ownerUserId) as object)};
  },
  async setMainTeam(actorId:number,taskId:number,inputIds:number[]){
    await withTransaction(transaction=>setCollaborativeMainTeamInTransaction(actorId,taskId,inputIds,transaction));
    return this.view(actorId,taskId);
  },
  async setChildTeam(actorId:number,taskId:number,subtaskId:number,mode:'INHERIT'|'CUSTOM',selectedIds:number[]){
    const selected=normalizeCollaborators(selectedIds);
    await withTransaction(async transaction=>{
      const {context}=await lockTask(actorId,taskId,transaction,true);
      if (!context.isCollaborative) throw inactive();
      await repo.ensureChildModes(taskId,actorId,transaction);
      const old=await repo.activeAssignments(taskId,transaction);
      const main=old.filter(a=>a.subtaskId===null).map(a=>a.assigneeUserId);
      const desired=mode==='INHERIT'?main:selected;
      if (desired.length===0 || desired.length>30) throw new AppError({statusCode:400,
        code:'COLLABORATION_TEAM_SIZE',message:'Subtasks need at least one eligible assignee.'});
      await validateTeam(context,desired,transaction);
      const oldMode=(await repo.childModes(taskId,transaction)).find(child=>child.subtaskId===subtaskId);
      await repo.setChildMode(taskId,subtaskId,actorId,mode,transaction);
      if(oldMode?.mode!==mode) {
        const child=await taskDetailsRepository.findSubtask(context.ownerUserId,subtaskId,transaction);
        await tasksRepository.addActivity(transaction,context.ownerUserId,taskId,'COLLAB_TEAM_MODE_CHANGED',
          {subtaskId,subtaskTitle:child?.title??null,from:oldMode?.mode??null,to:mode},actorId);
      }
      await syncMembers(transaction,context,subtaskId,desired,actorId,old,
        mode==='INHERIT'?'INHERITED':'EXPLICIT');
      await recalculate(taskId,actorId,transaction);
    });
    return this.view(actorId,taskId);
  },
  async addNote(actorId:number,assignmentId:number,note:string){
    await withTransaction(async transaction=>{
      const row=await repo.assignment(assignmentId,transaction);
      if (!row || row.assigneeUserId!==actorId) throw notFound();
      if (!row.isActive) throw inactive();
      await lockTask(actorId,row.taskId,transaction);
      const fresh=await repo.assignment(assignmentId,transaction);
      if (!fresh?.isActive || fresh.assigneeUserId!==actorId) throw notFound();
      await repo.addNote(assignmentId,actorId,note,transaction);
      await recalculate(row.taskId,actorId,transaction);
    });
    return {assignmentId};
  },
  async complete(actorId:number,assignmentId:number,completed:boolean){
    await withTransaction(async transaction=>{
      const row=await repo.assignment(assignmentId,transaction);
      if (!row) throw notFound();
      const {context}=await lockTask(actorId,row.taskId,transaction);
      const fresh=await repo.assignment(assignmentId,transaction);
      if (!fresh?.isActive) throw inactive();
      if (completed && fresh.assigneeUserId!==actorId) throw denied();
      if (!completed && actorId!==fresh.assigneeUserId && actorId!==context.ownerUserId) throw denied();
      if ((fresh.state==='DONE')===completed) return;
      await repo.updateCompletion(assignmentId,completed,actorId,transaction);
      await recalculate(row.taskId,actorId,transaction);
      if(!completed && actorId===context.ownerUserId && actorId!==row.assigneeUserId) {
        await notifyGeneralTask(transaction,[row.assigneeUserId],actorId,{
          type:'GENERAL_TASK_REOPENED',taskId:row.taskId,listId:context.listId,
          taskOwnerUserId:context.ownerUserId,subjectTitle:context.title,
          contextTitle:context.meetingTitle??'Your collaborative assignment was reopened',
        });
      }
    });
    return {assignmentId,completed};
  },
  async upload(actorId:number,assignmentId:number,file:Express.Multer.File){
    const row=await repo.assignment(assignmentId);
    if (!row || !row.isActive || row.assigneeUserId!==actorId) throw notFound();
    const task=await repo.task(row.taskId);
    if (!task?.isCollaborative || task.status==='CANCELLED') throw notFound();
    const name=cleanUploadedAttachmentFileName(file.originalname,255);
    if (!name) throw new AppError({statusCode:400,code:'ATTACHMENT_NAME_INVALID',message:'Invalid file name.'});
    const extension=path.extname(name).toLowerCase();
    const key=await storeAttachment(file.buffer,extension);
    try {
      const id=await withTransaction(async transaction=>{
        const current=await repo.assignment(assignmentId,transaction);
        if (!current || !current.isActive || current.assigneeUserId!==actorId) throw notFound();
        await lockTask(actorId,current.taskId,transaction);
        const fresh=await repo.assignment(assignmentId,transaction);
        if (!fresh?.isActive || fresh.assigneeUserId!==actorId) throw notFound();
        return repo.attachFile(assignmentId,actorId,{name,key,mime:file.mimetype||'application/octet-stream',
          extension,size:file.size},transaction);
      });
      return {id};
    }catch(error){await removeStoredAttachment(key);throw error;}
  },
  async removeFile(actorId:number,id:string){
    const previous=await repo.file(id);
    if (!previous || !canDeleteCollaborativeEvidence(actorId,previous)) throw notFound();
    const context=await repo.task(previous.taskId);
    if (!context?.isCollaborative) throw notFound();
    const storageKey=await withTransaction(async transaction=>{
      // Serialize with assignment changes and ensure a revoked assignee cannot delete old evidence.
      await lockTask(actorId,previous.taskId,transaction);
      const current=await repo.file(id,transaction);
      if (!current || !canDeleteCollaborativeEvidence(actorId,current) ||
          current.assignmentId!==previous.assignmentId)
        throw notFound();
      const changed=await repo.deleteOwnFile(id,actorId,transaction);
      if (!changed) throw notFound();
      await repo.event(current.assignmentId,actorId,'FILE_REMOVED',transaction,current.name);
      return current.key;
    });
    await removeStoredAttachment(storageKey);
  },
  async download(actorId:number,id:string){
    const file=await repo.file(id);
    if (!file) throw notFound();
    if (actorId!==file.ownerUserId && (actorId!==file.assigneeUserId || !file.isActive)) throw notFound();
    const context=await repo.task(file.taskId);
    if (!context || (context.meetingId!==null && actorId!==context.ownerUserId &&
        !(await withTransaction(transaction=>repo.meetingEligible(actorId,context.meetingId!,
          context.meetingOrganizerUserId??context.ownerUserId,transaction))))) throw notFound();
    // Revoked assignments are excluded by repo.file. Former assignees cannot
    // retrieve private files through a saved direct URL.
    return {name:recoverAttachmentFileName(file.name),mime:file.mime,buffer:await readAttachment(file.key)};
  },
};

