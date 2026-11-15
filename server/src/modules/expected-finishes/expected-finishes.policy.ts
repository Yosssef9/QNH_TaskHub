/** Estimates belong to a principal assignee, never to an acting proxy or the task owner. */
export function canEditExpectedFinish(input: {
  actorId: number;
  assigneeId: number;
  ownerId: number;
  active: boolean;
  cancelled: boolean;
}): boolean {
  return input.active && !input.cancelled && input.actorId === input.assigneeId &&
    input.assigneeId !== input.ownerId;
}

export function isValidExpectedFinishDate(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 1 || year > 9999) return false;
  const normalized = new Date(0);
  normalized.setUTCFullYear(year, month - 1, day);
  return normalized.getUTCFullYear() === year && normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day;
}
