import type { KpiPeriodSummary } from '@/features/kpis/types/kpi.types'
import type { WorkCycle } from '@/features/work-cycles/types/work-cycle.types'

export interface DashboardCycleSummary {
  total: number
  completed: number
  inProgress: number
  overdue: number
  dueToday: number
}

export interface DashboardAttentionTask {
  id: number
  kpiInstanceId: number
  title: string
  kpiName: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  dueDate: string | null
  isOverdue: boolean
}

export interface DashboardKpiPerformance
  extends Pick<KpiPeriodSummary, 'actualValue' | 'targetAchievement' | 'status'> {
  instanceId: number
  name: string
  color: string
  measurementUnit: 'PERCENT' | 'NUMBER'
  targetValue: number | null
  periodStart: string
  periodEnd: string
}

export interface DashboardKpiHealth {
  met: number
  notMet: number
  noData: number
  noTarget: number
}

export interface DashboardPersonalSummary {
  defaultListId: number | null
  total: number
  inProgress: number
  overdue: number
  dueToday: number
}

export interface DashboardData {
  currentCycle: WorkCycle | null
  openCycleCount: number
  cycleSummary: DashboardCycleSummary | null
  attentionTasks: DashboardAttentionTask[]
  kpiPerformance: DashboardKpiPerformance[]
  kpiHealth: DashboardKpiHealth
  personalSummary: DashboardPersonalSummary
}
