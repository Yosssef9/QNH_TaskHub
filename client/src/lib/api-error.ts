import axios from 'axios'

import type { ApiErrorResponse } from '@/types/api.types'

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number | undefined
  readonly details: unknown

  constructor(message: string, code: string, status?: number, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error
  }

  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiError = error.response?.data?.error

    return new ApiClientError(
      apiError?.message ?? 'The server request failed.',
      apiError?.code ?? 'API_REQUEST_FAILED',
      error.response?.status,
      apiError?.details,
    )
  }

  return new ApiClientError('An unexpected client error occurred.', 'UNEXPECTED_CLIENT_ERROR')
}
