import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type {
  EmailSettingsData,
  PendingEmailVerification,
  UpdateEmailSettingsInput,
} from '../types/email-settings.types'

export async function getEmailSettings(): Promise<EmailSettingsData> {
  const response = await apiClient.get<ApiSuccessResponse<EmailSettingsData>>('/email-settings')
  return response.data.data
}

export async function updateEmailSettings(
  input: UpdateEmailSettingsInput,
): Promise<EmailSettingsData> {
  const response = await apiClient.patch<ApiSuccessResponse<EmailSettingsData>>(
    '/email-settings',
    input,
  )
  return response.data.data
}

export async function requestAlternateEmailVerification(
  email: string,
): Promise<PendingEmailVerification> {
  const response = await apiClient.post<
    ApiSuccessResponse<{ verification: PendingEmailVerification }>
  >('/email-settings/alternate/request-verification', { email })
  return response.data.data.verification
}

export async function resendAlternateEmailVerification(): Promise<PendingEmailVerification> {
  const response = await apiClient.post<
    ApiSuccessResponse<{ verification: PendingEmailVerification }>
  >('/email-settings/alternate/resend-verification')
  return response.data.data.verification
}

export async function verifyAlternateEmail(code: string): Promise<EmailSettingsData> {
  const response = await apiClient.post<ApiSuccessResponse<EmailSettingsData>>(
    '/email-settings/alternate/verify',
    { code },
  )
  return response.data.data
}

export async function deleteAlternateEmail(): Promise<EmailSettingsData> {
  const response = await apiClient.delete<ApiSuccessResponse<EmailSettingsData>>(
    '/email-settings/alternate',
  )
  return response.data.data
}

export async function sendTestEmail(): Promise<{ recipient: string }> {
  const response = await apiClient.post<ApiSuccessResponse<{ recipient: string }>>(
    '/email-settings/test',
  )
  return response.data.data
}
