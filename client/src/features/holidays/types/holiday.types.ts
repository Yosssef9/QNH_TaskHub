export interface Holiday {
  id: number
  holidayDate: string
  nameAr: string
  nameEn: string
  isActive: boolean
}

export type SaveHolidayInput = Omit<Holiday, 'id'>
