/** Individual collaborative activity is visible to the owner, or to its current
 * assignee only. The event payload never contains private note bodies or file keys.
 * A subtask-only assignee cannot see events for sibling subtasks.
 */
export interface TaskActivityVisibilityRecord {
  activityType: string;
  eventDataJson: string | null;
}

export function canViewCollaborativeActivity(
  event: TaskActivityVisibilityRecord,
  actorId: number,
  visibleChildIds: ReadonlySet<number>,
  proxyPrincipalIds: ReadonlySet<number> = new Set<number>(),
  proxyMainPrincipalIds: ReadonlySet<number> = new Set<number>(),
): boolean {
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
