import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { hasModuleAccessPermission } from '@/features/auth/access-permissions'

export function useTaskAssignmentPermission() {
  const currentUser = useCurrentUser()
  const id = currentUser.data?.user.userId ?? null
  const access = currentUser.data?.access
  const canAssignOthers = access?.roleCode === 'ADMIN' ||
    hasModuleAccessPermission(access, 'TASK_MANAGEMENT', 'TASK_ASSIGNMENTS', 'TASK_ASSIGN_OTHERS')
  return { currentUserId: id, canAssignOthers: Boolean(canAssignOthers) }
}
