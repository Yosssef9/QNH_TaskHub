import { useMutation, useQueryClient } from '@tanstack/react-query'

import { currentUserQueryKey } from '@/features/auth/hooks/use-current-user'

import { updateAccessUser } from '../api/access.api'
import { accessUsersQueryKey } from './use-access-users'

export function useUpdateAccess() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateAccessUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accessUsersQueryKey })
      void queryClient.invalidateQueries({ queryKey: currentUserQueryKey })
    },
  })
}
