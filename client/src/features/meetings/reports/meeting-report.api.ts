import type { ApiSuccessResponse } from '@/types/api.types'
import type { MeetingReportSchedule } from './meeting-report-status.types'
import { apiClient } from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-error'

export type MeetingReportLanguage = 'ar' | 'en'

/** Keep authentication on the existing API client; never put a Portal token in the download URL. */
export async function downloadMeetingReport(meetingId: number, language: MeetingReportLanguage): Promise<void> {
  const response = await apiClient.get<Blob>(`/meetings/${meetingId}/report.pdf`, {
    params: { language },
    responseType: 'blob',
    timeout: 150_000,
    headers: { Accept: 'application/pdf' },
    // The shared error interceptor cannot read JSON inside a Blob. Decode errors here instead.
    validateStatus: () => true,
  })
  if (response.status !== 200) {
    let code = 'MEETING_REPORT_FAILED'
    let message = 'The Meeting report could not be generated.'
    try {
      const body: unknown = JSON.parse(await response.data.text())
      if (body && typeof body === 'object' && 'error' in body) {
        const error = body.error
        if (error && typeof error === 'object') {
          if ('code' in error && typeof error.code === 'string') code = error.code
          if ('message' in error && typeof error.message === 'string') message = error.message
        }
      }
    } catch {
      // A proxy error may be HTML. Never download or display that response as a PDF.
    }
    throw new ApiClientError(message, code, response.status)
  }
  const contentType = String(response.headers['content-type'] ?? '').toLowerCase()
  const signature = await response.data.slice(0, 5).text()
  if (!contentType.includes('application/pdf') || signature !== '%PDF-') {
    throw new ApiClientError('The server did not return a valid PDF.', 'MEETING_REPORT_FAILED', response.status)
  }
  const url = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Meeting-${meetingId}-Report-${language.toUpperCase()}.pdf`
  try {
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Allow the browser to start the download before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}


/** A status read never renders a PDF or triggers email delivery. */
export async function getMeetingReportStatus(meetingId: number, signal?: AbortSignal): Promise<MeetingReportSchedule> {
  const response = await apiClient.get<ApiSuccessResponse<MeetingReportSchedule>>(
    `/meetings/${meetingId}/report-status`, signal ? { signal } : {},
  )
  return response.data.data
}
