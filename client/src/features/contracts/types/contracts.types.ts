export type ContractTrackingState = 'UPCOMING' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED'
export type ContractValueType = 'FIXED' | 'VARIABLE'
export type ContractPaymentFrequency =
  | 'ONE_TIME'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUAL'
  | 'ANNUAL'
export type ContractPaymentTiming = 'IN_ADVANCE' | 'IN_ARREARS'
export type ContractActivityType =
  | 'CREATED'
  | 'UPDATED'
  | 'ARCHIVED'
  | 'RESTORED'
  | 'ATTACHMENT_ADDED'
  | 'ATTACHMENT_REMOVED'

export interface ContractAccess {
  isOwner: boolean
  canManageAttachments: boolean
}

export interface Contract {
  id: number
  ownerUserId: number
  ownerUserName: string
  supplierId: number
  supplierName: string
  contractNumber: string | null
  title: string
  startDate: string
  endDate: string | null
  durationDays: number | null
  daysRemaining: number | null
  trackingState: ContractTrackingState
  isAutoRenewal: boolean
  renewalTermMonths: number | null
  noticePeriodDays: number | null
  noticeDeadline: string | null
  valueType: ContractValueType
  contractValueSar: number | null
  paymentFrequency: ContractPaymentFrequency | null
  paymentTiming: ContractPaymentTiming | null
  notes: string | null
  isActive: boolean
  createdAtUtc: string
  updatedAtUtc: string | null
  rowVersion: string
  fileCount: number
  access: ContractAccess
}

export interface ContractAttachment {
  id: string
  contractId: number
  originalFileName: string
  mimeType: string
  fileExtension: string
  sizeBytes: number
  uploadedByUserId: number
  uploadedByUserName: string
  createdAtUtc: string
}

export interface ContractInput {
  supplierId: number
  contractNumber: string | null
  title: string
  startDate: string
  endDate: string | null
  isAutoRenewal: boolean
  renewalTermMonths: number | null
  noticePeriodDays: number | null
  valueType: ContractValueType
  contractValueSar: number | null
  paymentFrequency: ContractPaymentFrequency | null
  paymentTiming: ContractPaymentTiming | null
  notes: string | null
}

export interface ContractSummary {
  total: number
  active: number
  expiringSoon: number
  expired: number
  upcoming: number
}

export interface ContractListQuery {
  search: string
  ownerUserId?: number | undefined
  page: number
  pageSize: number
  archived: boolean
  status?: ContractTrackingState | undefined
  supplierId?: number | undefined
  autoRenewal?: boolean | undefined
  valueType?: ContractValueType | undefined
  paymentFrequency?: ContractPaymentFrequency | undefined
  paymentTiming?: ContractPaymentTiming | undefined
  startFrom?: string | undefined
  startTo?: string | undefined
  endFrom?: string | undefined
  endTo?: string | undefined
  sortBy: 'title' | 'supplier' | 'startDate' | 'endDate' | 'value'
  sortDirection: 'asc' | 'desc'
}

export interface ContractScope {
  ownerUserId: number
  ownerUserName: string
  isOwn: boolean
  canManageAttachments: boolean
}

export interface ContractAccessScope extends ContractScope {
  ownerUserCode: string
}

export interface ContractList {
  items: Contract[]
  page: number
  pageSize: number
  total: number
  summary: ContractSummary
  scope: ContractScope
}

export interface ContractActivity {
  id: number
  type: ContractActivityType
  changes: Record<string, { from: unknown; to: unknown }> | null
  actorUserId: number
  actorName: string
  createdAtUtc: string
}

export interface ContractUserSettings {
  expiringSoonDays: number
  expirationEmailEnabled: boolean
  expirationReminderLeadDays: number
  noticeEmailEnabled: boolean
  noticeReminderLeadDays: number
  rowVersion: string
}


