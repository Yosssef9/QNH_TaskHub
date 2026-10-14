/** Match a user's name, employee code, or email with one case-insensitive query. */
export function matchesTaskAssigneeSearch(
  user: { userName: string; userCode: string; email?: string | null },
  search: string,
): boolean {
  const normalized = search.trim().toLocaleLowerCase()
  if (!normalized) return true
  return [user.userName, user.userCode, user.email].some(
    (field) => field?.toLocaleLowerCase().includes(normalized) ?? false,
  )
}
