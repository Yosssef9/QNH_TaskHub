import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { meetingsQueryKey } from '../hooks/use-meetings'
import {
  createMeetingSeries,
  getMeetingSeriesDetail,
  getMeetingSeriesLinkForMeeting,
  listMeetingSeries,
  previewMeetingSeries,
  uploadMeetingSeriesAttachment,
} from './meeting-series.api'
import type { MeetingSeriesListInput, MeetingSeriesPreviewInput } from './meeting-series.types'

export const meetingSeriesQueryKey = [...meetingsQueryKey, 'series'] as const

export function useMeetingSeriesPreview(input: MeetingSeriesPreviewInput | null) {
  return useQuery({
    queryKey: input
      ? [...meetingSeriesQueryKey, 'preview', input]
      : [...meetingSeriesQueryKey, 'preview', 'idle'],
    queryFn: () => previewMeetingSeries(input as MeetingSeriesPreviewInput),
    enabled: input !== null,
    staleTime: 0,
    retry: false,
  })
}

export function useCreateMeetingSeries() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: createMeetingSeries,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: meetingsQueryKey })
      void client.invalidateQueries({ queryKey: meetingSeriesQueryKey })
    },
  })
}



export function useUploadMeetingSeriesAttachment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: uploadMeetingSeriesAttachment,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: [...meetingSeriesQueryKey, 'detail', input.seriesId] })
      void client.invalidateQueries({ queryKey: meetingsQueryKey })
    },
  })
}

export function useMeetingSeriesList(input: MeetingSeriesListInput) {
  return useQuery({
    queryKey: [...meetingSeriesQueryKey, 'list', input],
    queryFn: () => listMeetingSeries(input),
    staleTime: 30_000,
  })
}

export function useMeetingSeriesDetail(seriesId: number | null) {
  return useQuery({
    queryKey: [...meetingSeriesQueryKey, 'detail', seriesId ?? 'idle'],
    queryFn: () => getMeetingSeriesDetail(seriesId as number),
    enabled: seriesId !== null,
    staleTime: 30_000,
  })
}

export function useMeetingSeriesLink(meetingId: number | null, enabled = true) {
  return useQuery({
    queryKey: [...meetingSeriesQueryKey, 'meeting-link', meetingId ?? 'idle'],
    queryFn: () => getMeetingSeriesLinkForMeeting(meetingId as number),
    enabled: enabled && meetingId !== null,
    staleTime: 60_000,
  })
}

