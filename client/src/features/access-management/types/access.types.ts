import type { TaskHubRoleCode } from '@/features/auth/types/auth.types'

export interface AccessUser {
  userId: number
  userCode: string
  userName: string
  email: string | null
  portalIsActive: boolean
  roleCode: TaskHubRoleCode | null
  accessIsActive: boolean
  procurementEnabled: boolean
  meetingOrganizeEnabled?: boolean
  meetingCoordinateEnabled?: boolean
}

export interface AccessUserList {
  items: AccessUser[]
  page: number
  pageSize: number
  total: number
}

export interface AccessListQuery {
  search: string
  page: number
  pageSize: number
}

export interface UpdateAccessInput {
  userId: number
  roleCode: TaskHubRoleCode
  isActive: boolean
  procurementEnabled: boolean
  meetingOrganizeEnabled: boolean
  meetingCoordinateEnabled: boolean
}

