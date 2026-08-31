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

export interface Supplier {
  id: number
  name: string
  commercialRegistrationNo: string | null
  taxNumber: string | null
  primaryContactName: string | null
  primaryContactEmail: string | null
  primaryContactPhone: string | null
  addressText: string | null
  notes: string | null
  isActive: boolean
  currentContractCount: number
  expiringSoonContractCount: number
  createdAtUtc: string
  updatedAtUtc: string | null
  rowVersion: string
}

export interface SupplierInput {
  name: string
  commercialRegistrationNo: string | null
  taxNumber: string | null
  primaryContactName: string | null
  primaryContactEmail: string | null
  primaryContactPhone: string | null
  addressText: string | null
  notes: string | null
}

export interface SupplierListQuery {
  search: string
  page: number
  pageSize: number
  archived: boolean
}

export interface SupplierList {
  items: Supplier[]
  page: number
  pageSize: number
  total: number
}

export interface Contract {
  id: number
  supplierId: number
  supplierName: string
  supplierIsActive: boolean
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
}

export interface ContractAttachment {
  id: string
  contractId: number
  originalFileName: string
  mimeType: string
  fileExtension: string
  sizeBytes: number
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

export interface ContractList {
  items: Contract[]
  page: number
  pageSize: number
  total: number
  summary: ContractSummary
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

