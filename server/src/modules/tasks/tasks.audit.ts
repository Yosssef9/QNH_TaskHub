/** Field-level immutable audit payload for main Task metadata edits. */
export type TaskAuditField = 'title' | 'description' | 'priority' | 'startDate' | 'dueDate';
export interface TaskAuditSnapshot {
  title: string;
  description: string | null;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
}
export interface TaskAuditChange {
  field: TaskAuditField;
  from: string | null;
  to: string | null;
}

export function taskUpdateFieldChanges(
  before: TaskAuditSnapshot,
  after: TaskAuditSnapshot,
): TaskAuditChange[] {
  const fields: readonly TaskAuditField[] = ['title', 'description', 'priority', 'startDate', 'dueDate'];
  return fields.flatMap((field) => {
    const from = before[field];
    const to = after[field];
    return from === to ? [] : [{ field, from, to }];
  });
}
