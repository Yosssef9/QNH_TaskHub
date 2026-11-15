/** Individual collaborative activity is visible to the owner, or to its current
 * assignee only. The event payload never contains private note bodies or file keys.
 * A subtask-only assignee cannot see events for sibling subtasks.
 */
export interface TaskActivityVisibilityRecord {
  activityType: string;
  eventDataJson: string | null;
}

/** Estimate changes are private to the employee whose estimate changed, or
 * to the task owner (owner is handled by the Task Details service). Visibility
 * also requires a currently active assignment for the same task/subtask scope.
 * Missing or malformed event identities must never expose history to a peer.
 */
export function canViewExpectedFinishActivity(
  event: TaskActivityVisibilityRecord,
  actorId: number,
  visibleChildIds: ReadonlySet<number>,
  hasMainAssignment: boolean,
): boolean {
  if (event.activityType !== 'EXPECTED_FINISH_CHANGED' || !event.eventDataJson) return false;
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(event.eventDataJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    payload = parsed as Record<string, unknown>;
  } catch { return false; }
  if (typeof payload.assigneeUserId !== 'number' || payload.assigneeUserId !== actorId) return false;
  if (payload.subtaskId === null) return hasMainAssignment;
  if (typeof payload.subtaskId !== 'number' || !Number.isSafeInteger(payload.subtaskId)) return false;
  return visibleChildIds.has(payload.subtaskId);
}

export function canViewCollaborativeActivity(
  event: TaskActivityVisibilityRecord,
  actorId: number,
  visibleChildIds: ReadonlySet<number>,
  proxyPrincipalIds: ReadonlySet<number> = new Set<number>(),
  proxyMainPrincipalIds: ReadonlySet<number> = new Set<number>(),
  hasMainAssignment = false,
): boolean {
  if (event.activityType === 'EXPECTED_FINISH_CHANGED')
    return canViewExpectedFinishActivity(event, actorId, visibleChildIds, hasMainAssignment);
  if (event.activityType === 'CREATED' || event.activityType === 'STATUS_CHANGED' ||
      event.activityType === 'COLLAB_PARENT_STATUS_CHANGED' || event.activityType === 'COLLAB_ENABLED') return true;
  const childMetadataEvent = ['SUBTASK_CREATED','SUBTASK_UPDATED','SUBTASK_DELETED',
    'SUBTASK_COMPLETED','SUBTASK_REOPENED'].includes(event.activityType);
  if (!event.activityType.startsWith('COLLAB_') && !childMetadataEvent) return false;
  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = event.eventDataJson ? JSON.parse(event.eventDataJson) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch { return false; }
  if (!data) return false;
  if (childMetadataEvent) return data.subtaskId != null && visibleChildIds.has(Number(data.subtaskId));
  if (event.activityType === 'COLLAB_SUBTASK_COMPLETED' || event.activityType === 'COLLAB_SUBTASK_REOPENED' ||
      event.activityType === 'COLLAB_TEAM_MODE_CHANGED')
    return data.subtaskId !== null && data.subtaskId !== undefined &&
      visibleChildIds.has(Number(data.subtaskId));
  if (data.assigneeUserId !== actorId && !proxyPrincipalIds.has(Number(data.assigneeUserId))) return false;
  // Historical subtask events stay hidden once the user loses that subtask's access.
  if (data.subtaskId === null) return data.assigneeUserId === actorId ||
    proxyMainPrincipalIds.has(Number(data.assigneeUserId));
  return data.subtaskId !== undefined && visibleChildIds.has(Number(data.subtaskId));
}

