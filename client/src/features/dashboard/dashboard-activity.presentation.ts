import type { DashboardActivity } from './api/dashboard-activity.api'

export interface DashboardActivityGroup {
  /** All audit events remain available in the original detail timeline. */
  events: DashboardActivity[]
}

/** Group only *adjacent*, same-actor, same-object actions performed within 90 seconds.
 * This is a presentation-only operation; individual audit events are not changed. */
export function groupDashboardActivity(rows: DashboardActivity[]): DashboardActivityGroup[] {
  const ordered = [...rows].sort((a, b) =>
    Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc) || b.id - a.id)
  const groups: DashboardActivityGroup[] = []
  for (const activity of ordered) {
    const previous = groups.at(-1)
    const newest = previous?.events[0]
    const earliest = previous?.events.at(-1)
    const delta = earliest ? Date.parse(earliest.createdAtUtc) - Date.parse(activity.createdAtUtc) : Infinity
    if (newest && earliest && newest.kind === activity.kind && newest.objectId === activity.objectId &&
      newest.actorUserId === activity.actorUserId && Number.isFinite(delta) && delta >= 0 && delta <= 90_000 &&
      previous.events.length < 4) {
      previous.events.push(activity)
    } else {
      groups.push({ events: [activity] })
    }
  }
  return groups
}

/** Fallback for older or custom activity types without a translation. */
export function humanizeActivityType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
}

export function activityDetails(event: DashboardActivity): {
  subtaskTitle: string | null
  affectedUserName: string | null
  changeField: string | null
} {
  return {
    subtaskTitle: event.subtaskTitle?.trim() || null,
    affectedUserName: event.affectedUserName?.trim() || null,
    // Exclude unknown fields; they could originate from legacy/custom audit metadata.
    changeField: ['title', 'priority', 'startDate', 'dueDate', 'description'].includes(event.changeField ?? '')
      ? event.changeField : null,
  }
}
