import type { TaskActivity, Subtask } from '../types/task.types'

const textValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

export function taskActivityDetails(activity: TaskActivity, subtasks: Pick<Subtask, 'id' | 'title'>[]) {
  const event = activity.eventData
  const id = typeof event?.subtaskId === 'number' ? event.subtaskId : Number(event?.subtaskId)
  const subtaskTitle = textValue(event?.subtaskTitle) ?? textValue(event?.title) ??
    (Number.isSafeInteger(id) ? subtasks.find(child => child.id === id)?.title ?? null : null)
  // Prefer event-time identity when present; existing/legacy events fall back to
  // current directory data returned by the Task Details API.
  return {
    subtaskTitle,
    actorName: textValue(event?.actorName) ?? activity.actorName,
    actorCode: textValue(event?.actorCode) ?? activity.actorUserCode ?? null,
    actorEmail: textValue(event?.actorEmail) ?? activity.actorEmail ?? null,
    assigneeName: textValue(event?.assigneeName),
    assigneeCode: textValue(event?.assigneeCode),
    assigneeEmail: textValue(event?.assigneeEmail),
    fileName: textValue(event?.fileName),
    from: textValue(event?.from),
    to: textValue(event?.to),
    oldTitle: textValue(event?.oldTitle),
    newTitle: textValue(event?.newTitle),
  }
}
