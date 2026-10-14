import type { MeetingActionItemCapabilities } from '../meeting-action-items/meeting-action-items.types.js';
import type { SharePermission } from './task-shares.repository.js';

/** Sharing grants task-context rights, never execution or delegation rights. */
export function shareCapabilities(permission:SharePermission):MeetingActionItemCapabilities {
 const canEdit=permission==='EDIT';
 return {
  role:'VIEWER',canEditDetails:canEdit,canManageSubtasks:canEdit,
  canUploadAttachments:canEdit,canDeleteAnyAttachment:false,
  canCompleteSubtasks:false,canCompleteTask:false,canChangeNonCompletionStatus:false,
  canDeleteRestoreTask:false,
 };
}

export function canViewSharedPrivateContribution():false {return false;}
