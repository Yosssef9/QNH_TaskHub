import { apiClient } from '@/lib/api-client'
import type { ApiSuccessResponse } from '@/types/api.types'

import type { Holiday, SaveHolidayInput } from '../types/holiday.types'

export async function getHolidays() {
  const response =
    await apiClient.get<ApiSuccessResponse<{ holidays: Holiday[] }>>('/admin/holidays')
  return response.data.data.holidays
}

export async function saveHoliday(input: { holidayId?: number; values: SaveHolidayInput }) {
  const response = input.holidayId
    ? await apiClient.put<ApiSuccessResponse<{ holiday: Holiday }>>(
        `/admin/holidays/${input.holidayId}`,
        input.values,
      )
    : await apiClient.post<ApiSuccessResponse<{ holiday: Holiday }>>(
        '/admin/holidays',
        input.values,
      )
  return response.data.data.holiday
}
