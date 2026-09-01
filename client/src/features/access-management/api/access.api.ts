import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  AccessListQuery,
  AccessUser,
  AccessUserList,
  UpdateAccessInput,
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
      contractsEnabled: input.contractsEnabled,
      meetingOrganizeEnabled: input.meetingOrganizeEnabled,
      meetingCoordinateEnabled: input.meetingCoordinateEnabled,
    },
  )

  return response.data.data.user
}
