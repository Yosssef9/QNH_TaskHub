import type { CollaborativeMember, CollaborativeView } from './collaboration.api'

/** Client-side presentation rule; API authorization remains the security boundary. */
export function myCollaborativeAssignment(members: readonly CollaborativeMember[], actorId: number | null,
  subtaskId: number | null): CollaborativeMember | undefined {
  if (actorId === null) return undefined
  return members.find(member => member.isActive && (member.userId === actorId || member.proxyUserId === actorId) && member.subtaskId === subtaskId)
}

/** Never hand another user's submissions to a regular assignee's panel. */
export function visibleCollaborativeSubmissions(view: CollaborativeView, actorId: number | null,
  canManage: boolean, subtaskId: number | null): CollaborativeMember[] {
  return view.members.filter(member => member.isActive && member.subtaskId === subtaskId &&
    (canManage || member.userId === actorId || member.proxyUserId === actorId))
}

export function collaborativeScopeProgress(view: CollaborativeView, subtaskId: number | null) {
  return view.progress.find(item => item.scopeId === subtaskId) ?? {scopeId:subtaskId,total:0,completed:0}
}
