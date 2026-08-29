export type EmailAddressSource = 'PORTAL' | 'ALTERNATE'

export const EMAIL_PREFERENCE_EVENTS = [
  'TASK_OVERDUE',
  'TASK_DUE_TODAY',
  'HIGH_PRIORITY_TASK_DUE_TOMORROW',
  'CURRENT_CYCLE_ENDING_SOON',
  'CURRENT_CYCLE_PAST_END',
  'KPI_BELOW_TARGET',
  'KPI_MEASUREMENT_DUE',
] as const

export type EmailPreferenceEvent = (typeof EMAIL_PREFERENCE_EVENTS)[number]

export interface EmailEventPreference {
  eventType: EmailPreferenceEvent
  enabled: boolean
}

export interface PendingEmailVerification {
  maskedEmail: string
  expiresAtUtc: string
  resendAvailableAtUtc: string
  attemptsRemaining: number
}

export interface EmailSettingsData {
  systemEnabled: boolean
  notificationsEnabled: boolean
  portalEmail: string | null
  alternateEmail: string | null
  alternateVerified: boolean
  activeEmailSource: EmailAddressSource
  activeEmail: string | null
  canEnableEmail: boolean
  preferences: EmailEventPreference[]
  pendingVerification: PendingEmailVerification | null
}

export interface UpdateEmailSettingsInput {
  notificationsEnabled?: boolean
  activeEmailSource?: EmailAddressSource
  preferences?: EmailEventPreference[]
}
