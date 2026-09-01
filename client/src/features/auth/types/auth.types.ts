export interface PortalUser {
  userId: number
  userCode: string
  userName: string
  email: string | null
}

export type TaskHubRoleCode = 'USER' | 'ADMIN'
export type LanguageCode = 'AR' | 'EN'
export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM'

export interface TaskHubAccess {
  roleCode: TaskHubRoleCode
  contractsEnabled: boolean
  meetingOrganizeEnabled?: boolean
  meetingCoordinateEnabled?: boolean
}

export interface UserPreferences {
  languageCode: LanguageCode
  theme: ThemePreference
  sidebarCollapsed: boolean
  calendarShowAdjacentDates: boolean
  timezone: 'Asia/Riyadh'
}

export interface AuthMeData {
  user: PortalUser
  access: TaskHubAccess
  preferences: UserPreferences
}
