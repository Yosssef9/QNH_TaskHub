import type { TaskHubRoleCode } from '@/features/auth/types/auth.types'

export interface ProcurementAccessState {
  contracts: boolean
  items: boolean
  suppliers: boolean
  priceQuotes: boolean
}

export interface AccessUser {
  userId: number
  userCode: string
  userName: string
  email: string | null
  portalIsActive: boolean
  roleCode: TaskHubRoleCode | null
  accessIsActive: boolean
  procurementAccess: ProcurementAccessState
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
  procurementAccess: ProcurementAccessState
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
