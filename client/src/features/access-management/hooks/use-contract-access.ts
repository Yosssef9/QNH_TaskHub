import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { currentUserQueryKey } from '@/features/auth/hooks/use-current-user'

import {
  getContractAccessAdminData,
  updateContractDelegation,
} from '../api/access.api'
import { accessUsersQueryKey } from './use-access-users'

export const contractAccessAdminQueryKey = ['admin', 'contract-access'] as const

export function useContractAccessAdminData() {
  return useQuery({
    queryKey: contractAccessAdminQueryKey,
    queryFn: getContractAccessAdminData,
  })
}

export function useUpdateContractDelegation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateContractDelegation,
    onSuccess: (data) => {
      queryClient.setQueryData(contractAccessAdminQueryKey, data)
      void queryClient.invalidateQueries({ queryKey: accessUsersQueryKey })
      void queryClient.invalidateQueries({ queryKey: currentUserQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
}
