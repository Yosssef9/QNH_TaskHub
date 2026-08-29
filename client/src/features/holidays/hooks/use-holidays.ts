import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getHolidays, saveHoliday } from '../api/holidays.api'

const holidaysKey = ['admin', 'holidays'] as const

export function useHolidays() {
  return useQuery({ queryKey: holidaysKey, queryFn: getHolidays })
}

export function useSaveHoliday() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: saveHoliday,
    onSuccess: () => client.invalidateQueries({ queryKey: holidaysKey }),
  })
}
