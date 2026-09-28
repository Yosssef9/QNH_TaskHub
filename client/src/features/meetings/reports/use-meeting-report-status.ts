import { useQuery } from '@tanstack/react-query'
import { useCurrentUser } from '@/features/auth/hooks/use-current-user'
import { toApiClientError } from '@/lib/api-error'
import { getMeetingReportStatus } from './meeting-report.api'

export function useMeetingReportStatus(meetingId: number, meetingRowVersion: string) {
  const actorId = useCurrentUser().data?.user.userId
  return useQuery({
    // Do not reuse another account's status or briefly show a previous schedule after rescheduling.
    queryKey: ['meetings', 'report-status', meetingId, actorId, meetingRowVersion],
    queryFn: ({ signal }) => getMeetingReportStatus(meetingId, signal),
    enabled: actorId !== undefined,
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    retry: (attempt, error) => {
      const status = toApiClientError(error).status
      return attempt < 1 && status !== 401 && status !== 403 && status !== 404
    },
    refetchInterval: (query) => {
      const status = query.state.error ? toApiClientError(query.state.error).status : null
      if (status === 401 || status === 403 || status === 404) return false
      const state = query.state.data?.delivery.state
      return state === 'QUEUED' || state === 'PROCESSING' || state === 'RETRYING' ? 10_000 : 60_000
    },
  })
}
