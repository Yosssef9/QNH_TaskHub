import axios from 'axios'

import { clientEnv } from '@/config/env'
import { toApiClientError } from '@/lib/api-error'
import { getPortalToken } from '@/lib/get-portal-token'

export const apiClient = axios.create({
  baseURL: clientEnv.VITE_API_BASE_URL,
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = getPortalToken()

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiClientError(error)),
)
