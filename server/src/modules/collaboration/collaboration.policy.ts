/**
 * Collaborative Task assignment rules. Deliberately independent of SQL and HTTP
 * so the eventual activation/service layer can test every transition first.
 * KPI tasks must never enter this workflow.
 */
export type CollaborationState = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type CollaborationSubtaskMode = 'INHERIT' | 'CUSTOM';

export interface CollaborationMember {
  userId: number;
  state: CollaborationState;
  isActive: boolean;
}

export interface CollaborationChild {
  subtaskId: number;
  members: readonly CollaborationMember[];
}

export interface CollaborationProgress {
  mainCompleted: number;
  mainTotal: number;
  subtasksCompleted: number;
  subtasksTotal: number;
  /** Never automatically complete a task with no required assignees/work. */
  hasRequiredWork: boolean;
  allCompleted: boolean;
}

function active(members: readonly CollaborationMember[]): readonly CollaborationMember[] {
  return members.filter((member) => member.isActive);
}

/**
 * The main task completes only if every required main assignment is done and
 * every nondeleted subtask has at least one completed required assignment.
 * Empty main membership is permitted when a task delegates all work to children.
 */
export function collaborationProgress(
  mainMembers: readonly CollaborationMember[],
  children: readonly CollaborationChild[],
): CollaborationProgress {
  const main = active(mainMembers);
  const mainCompleted = main.filter((member) => member.state === 'DONE').length;
  const subtasksCompleted = children.filter((child) => {
    const members = active(child.members);
    return members.length > 0 && members.every((member) => member.state === 'DONE');
  }).length;
  const hasRequiredWork = main.length > 0 || children.length > 0;
  return {
    mainCompleted,
    mainTotal: main.length,
    subtasksCompleted,
    subtasksTotal: children.length,
    hasRequiredWork,
    allCompleted: hasRequiredWork && mainCompleted === main.length &&
      subtasksCompleted === children.length,
  };
}

/**
 * The team's membership is a set (duplicate people are not separate obligations).
 * Old completed records are kept as history, not carried into new assignment rows.
 */
export function normalizeCollaborators(userIds: readonly number[]): number[] {
  const users = [...new Set(userIds)];
  if (users.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Collaborative assignment requires positive integer Portal user IDs.');
  }
  return users;
}

export function reconcileInheritedTeam(
  mainMemberIds: readonly number[],
  currentActiveChildMemberIds: readonly number[],
): { add: number[]; remove: number[] } {
  const desired = normalizeCollaborators(mainMemberIds);
  const current = normalizeCollaborators(currentActiveChildMemberIds);
  return {
    add: desired.filter((id) => !current.includes(id)),
    remove: current.filter((id) => !desired.includes(id)),
  };
}

/** A child with its own team does not inherit changes from the parent. */
export function childMembershipChanges(
  mode: CollaborationSubtaskMode,
  mainMemberIds: readonly number[],
  currentActiveChildMemberIds: readonly number[],
): { add: number[]; remove: number[] } {
  return mode === 'INHERIT' ? reconcileInheritedTeam(mainMemberIds, currentActiveChildMemberIds)
    : { add: [], remove: [] };
}

/**
 * Private individual contributions: a team member sees only their own notes,
 * files and audit entries. Parent or Meeting organizer sees all.
 * Aggregate counts may be exposed separately without author information.
 */
export function canReadContribution(actorUserId: number, ownerUserId: number, assigneeUserId: number): boolean {
  return actorUserId === ownerUserId || actorUserId === assigneeUserId;
}

export function canChangeOwnCompletion(actorUserId: number, assigneeUserId: number): boolean {
  return actorUserId === assigneeUserId;
}

export function canReopenAssignment(actorUserId: number, ownerUserId: number, assigneeUserId: number): boolean {
  return actorUserId === ownerUserId || actorUserId === assigneeUserId;
}


/** Only the active assignment's original uploader may remove its private evidence.
 * Task creators can review other people's evidence, but cannot delete it for them.
 */
export function canDeleteCollaborativeEvidence(actorId:number,file:{
  assigneeUserId:number;proxyUserId?:number|null;uploadedByUserId:number;isActive:boolean;
}):boolean {
  return file.isActive && (actorId===file.assigneeUserId || actorId===file.proxyUserId) &&
    actorId===file.uploadedByUserId;
}

/** A proxy executes the principal's own active assignment, never becoming a second assignee. */
export function canExecuteCollaborativeAssignment(
  row:{isActive:boolean;assigneeUserId:number;proxyUserId:number|null},actorId:number
):boolean {
  return row.isActive && (row.assigneeUserId===actorId || row.proxyUserId===actorId);
}
