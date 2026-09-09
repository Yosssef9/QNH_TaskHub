import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  AccessListQuery,
  AccessUser,
  AccessUserList,
  ContractAccessAdminData,
  UpdateAccessInput,
  UpdateContractDelegationInput,
} from '../types/access.types'

export async function getAccessUsers(query: AccessListQuery): Promise<AccessUserList> {
  const response = await apiClient.get<ApiSuccessResponse<AccessUserList>>('/admin/access/users', {
    params: query,
  })

  return response.data.data
}

export async function updateAccessUser(input: UpdateAccessInput): Promise<AccessUser> {
  const response = await apiClient.put<ApiSuccessResponse<{ user: AccessUser }>>(
    `/admin/access/users/${input.userId}`,
    {
      roleCode: input.roleCode,
      isActive: input.isActive,
      procurementAccess: input.procurementAccess,
      meetingOrganizeEnabled: input.meetingOrganizeEnabled,
      meetingCoordinateEnabled: input.meetingCoordinateEnabled,
    },
  )

  return response.data.data.user
}

export async function getContractAccessAdminData(): Promise<ContractAccessAdminData> {
  const response = await apiClient.get<ApiSuccessResponse<ContractAccessAdminData>>(
    '/admin/access/contract-delegations',
  )
  return response.data.data
}

export async function updateContractDelegation(
  input: UpdateContractDelegationInput,
): Promise<ContractAccessAdminData> {
  const response = await apiClient.put<ApiSuccessResponse<ContractAccessAdminData>>(
    '/admin/access/contract-delegations',
    input,
  )
  return response.data.data
}
