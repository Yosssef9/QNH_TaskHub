import type { TaskHubRoleCode } from '@/features/auth/types/auth.types'

export interface ProcurementAccessState {
  contracts: boolean
  items: boolean
  suppliers: boolean
  priceQuotes: boolean
}

export type AccessRoleFilter = 'ALL' | 'USER' | 'ADMIN' | 'UNASSIGNED'
export type AccessStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'UNASSIGNED'
export type AccessPermissionFilter = 'ALL' | 'WITH_ACCESS' | 'WITHOUT_ACCESS'
export type AccessKpiWorkCyclesFilter = AccessPermissionFilter
export type AccessMeetingFilter = 'ALL' | 'ORGANIZER' | 'COORDINATOR' | 'BOTH' | 'NONE'
export type AccessSortBy =
  | 'userName'
  | 'userCode'
  | 'role'
  | 'procurement'
  | 'kpiWorkCycles'
  | 'meetings'
  | 'status'
export type AccessSortDirection = 'asc' | 'desc'

export interface AccessUser {
  userId: number
  userCode: string
  userName: string
  email: string | null
  portalIsActive: boolean
  roleCode: TaskHubRoleCode | null
  accessIsActive: boolean
  procurementAccess: ProcurementAccessState
  kpiWorkCyclesAccess: boolean
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
  role: AccessRoleFilter
  status: AccessStatusFilter
  procurement: AccessPermissionFilter
  kpiWorkCycles: AccessKpiWorkCyclesFilter
  meetings: AccessMeetingFilter
  sortBy: AccessSortBy
  sortDirection: AccessSortDirection
  page: number
  pageSize: number
}

export interface UpdateAccessInput {
  userId: number
  roleCode: TaskHubRoleCode
  isActive: boolean
  procurementAccess: ProcurementAccessState
  kpiWorkCyclesAccess: boolean
  meetingOrganizeEnabled: boolean
  meetingCoordinateEnabled: boolean
}

export interface ContractAccessAdminUser {
  userId: number
  userCode: string
  userName: string
  contractsAccess: boolean
}

export interface ContractAccessDelegation {
  granteeUserId: number
  granteeUserCode: string
  granteeUserName: string
  ownerUserId: number
  ownerUserCode: string
  ownerUserName: string
  view: boolean
  manageAttachments: boolean
}

export interface ContractAccessAdminData {
  users: ContractAccessAdminUser[]
  delegations: ContractAccessDelegation[]
}

export interface UpdateContractDelegationInput {
  granteeUserId: number
  ownerUserId: number
  view: boolean
  manageAttachments: boolean
}
