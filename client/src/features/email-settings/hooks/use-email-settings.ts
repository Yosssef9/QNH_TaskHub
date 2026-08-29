import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteAlternateEmail,
  getEmailSettings,
  requestAlternateEmailVerification,
  resendAlternateEmailVerification,
  sendTestEmail,
  updateEmailSettings,
  verifyAlternateEmail,
} from '../api/email-settings.api'
import type { EmailSettingsData } from '../types/email-settings.types'

export const emailSettingsQueryKey = ['email-settings'] as const

export function useEmailSettings() {
  return useQuery({
    queryKey: emailSettingsQueryKey,
    queryFn: getEmailSettings,
    staleTime: 30_000,
  })
}

function useSettingsMutation<TInput>(
  mutationFn: (input: TInput) => Promise<EmailSettingsData>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (data) => queryClient.setQueryData(emailSettingsQueryKey, data),
  })
}

export function useUpdateEmailSettings() {
  return useSettingsMutation(updateEmailSettings)
}

export function useVerifyAlternateEmail() {
  return useSettingsMutation((code: string) => verifyAlternateEmail(code))
}

export function useDeleteAlternateEmail() {
  return useSettingsMutation(async () => deleteAlternateEmail())
}

export function useRequestAlternateEmailVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: requestAlternateEmailVerification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: emailSettingsQueryKey })
    },
  })
}

export function useResendAlternateEmailVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resendAlternateEmailVerification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: emailSettingsQueryKey })
    },
  })
}

export function useSendTestEmail() {
  return useMutation({ mutationFn: sendTestEmail })
}
