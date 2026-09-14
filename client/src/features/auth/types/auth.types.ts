export interface PortalUser {
  userId: number
  userCode: string
  userName: string
  email: string | null
}

export type TaskHubRoleCode = 'USER' | 'ADMIN'
export type LanguageCode = 'AR' | 'EN'
export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM'
export type TimeFormatPreference = '12H' | '24H'
export type MeetingScheduleSlotInterval = 15 | 30 | 60
export type AccessModuleCode = 'PROCUREMENT' | 'KPI_MANAGEMENT'
export type ProcurementEntityCode = 'CONTRACTS' | 'ITEMS' | 'SUPPLIERS' | 'PRICE_QUOTES'
export type KpiWorkCyclesEntityCode = 'KPI_WORK_CYCLES'
export type AccessEntityCode = ProcurementEntityCode | KpiWorkCyclesEntityCode
export type AccessPermissionCode = 'ACCESS' | 'VIEW' | 'MANAGE_ATTACHMENTS'

export interface AccessPermission {
  moduleCode: AccessModuleCode
  entityCode: AccessEntityCode
  permissionCode: AccessPermissionCode
  resourceOwnerUserId: number | null
}

export interface TaskHubAccess {
  roleCode: TaskHubRoleCode
  permissions: AccessPermission[]
  meetingOrganizeEnabled?: boolean
  meetingCoordinateEnabled?: boolean
}

export interface UserPreferences {
  languageCode: LanguageCode
  theme: ThemePreference
  sidebarCollapsed: boolean
  calendarShowAdjacentDates: boolean
  meetingStartReminderEnabled: boolean
  timeFormat: TimeFormatPreference
  meetingScheduleSlotInterval: MeetingScheduleSlotInterval
  timezone: 'Asia/Riyadh'
}

export interface AuthMeData {
  user: PortalUser
  access: TaskHubAccess
  preferences: UserPreferences
}

