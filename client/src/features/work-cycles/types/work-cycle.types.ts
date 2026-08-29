import type { AppIconKey } from '@/config/app-icons'
import type { PersonalKpi } from '@/features/kpis/types/kpi.types'

export interface KpiInstance extends Omit<PersonalKpi, 'id'> {
  id: number
  templateId: number
  cycleId: number
  cycleTitle: string
  cycleClosedAtUtc: string | null
}

export interface WorkCycle {
  id: number
  title: string
  description: string | null
  iconKey: AppIconKey
  color: string
  startDate: string | null
  endDate: string | null
  displayOrder: number
  closedAtUtc: string | null
  archivedAtUtc: string | null
  isCurrent: boolean
  taskCount: number
  completedTaskCount: number
  overdueTaskCount: number
  instances: KpiInstance[]
}

export interface SaveWorkCycleInput {
  title: string
  description: string | null
  iconKey: AppIconKey
  color: PersonalKpi['color']
  startDate: string | null
  endDate: string | null
  kpiIds: number[]
}
