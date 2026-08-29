export const KPI_METHODS = [
  'ON_TIME_RATE',
  'TASK_COMPLETION_RATE',
  'SUBTASK_COMPLETION_RATE',
  'SUBTASK_ON_TIME_RATE',
  'MANUAL_RATIO',
  'MANUAL_NUMBER',
] as const

export const KPI_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const
export const KPI_DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'] as const
export const KPI_DEADLINE_DIRECTIONS = ['BEFORE', 'AFTER'] as const
export const KPI_DEADLINE_SOURCES = ['REFERENCE_DATE', 'TASK_DUE_DATE'] as const
export const KPI_ICON_KEYS = [
  'list-todo',
  'clipboard-list',
  'clipboard-check',
  'list-checks',
  'check-circle',
  'briefcase',
  'folder',
  'inbox',
  'file-text',
  'book-open',
  'notebook-pen',
  'calendar',
  'calendar-days',
  'clock',
  'timer',
  'alarm-clock',
  'flag',
  'pin',
  'target',
  'star',
  'heart',
  'heart-pulse',
  'stethoscope',
  'home',
  'user',
  'users',
  'building-2',
  'mail',
  'bell',
  'lightbulb',
  'rocket',
  'zap',
  'wrench',
  'settings',
  'laptop',
  'code-2',
  'package',
  'truck',
  'shopping-cart',
  'wallet',
  'gauge',
  'chart',
  'chart-bar',
  'chart-line',
  'activity',
  'award',
  'trophy',
  'shield-check',
] as const

export const KPI_COLORS = [
  '#0F766E',
  '#2563EB',
  '#0891B2',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#7C3AED',
] as const

export type KpiMethod = (typeof KPI_METHODS)[number]
export type KpiPeriod = (typeof KPI_PERIODS)[number]
export type KpiDirection = (typeof KPI_DIRECTIONS)[number]
export type KpiDeadlineDirection = (typeof KPI_DEADLINE_DIRECTIONS)[number]
export type KpiDeadlineSource = (typeof KPI_DEADLINE_SOURCES)[number]
export type KpiIconKey = (typeof KPI_ICON_KEYS)[number]
export type KpiColor = (typeof KPI_COLORS)[number]
export type KpiDueDateMode = 'AUTO' | 'REQUIRED' | 'OPTIONAL' | 'NONE'
export type KpiSubtaskDueDateMode = 'REQUIRED' | 'OPTIONAL' | 'NONE'

export interface KpiTaskPolicy {
  allowsTasks: boolean
  usesTasks: boolean
  dueDateMode: KpiDueDateMode
  requiresReferenceDate: boolean
  subtaskDueDateMode: KpiSubtaskDueDateMode
}

export interface PersonalKpi {
  id: number
  name: string
  description: string | null
  iconKey: KpiIconKey
  color: KpiColor
  calculationMethod: KpiMethod
  periodType: KpiPeriod
  measurementUnit: 'PERCENT' | 'NUMBER'
  targetValue: number | null
  targetDirection: KpiDirection | null
  deadlineSource: KpiDeadlineSource | null
  businessDayOffset: number | null
  deadlineDirection: KpiDeadlineDirection | null
  referenceDateLabel: string | null
  numeratorLabel: string | null
  denominatorLabel: string | null
  valueLabel: string | null
  displayOrder: number
  isActive: boolean
  taskCount: number
  taskPolicy: KpiTaskPolicy
}

export type SaveKpiInput = Omit<
  PersonalKpi,
  'id' | 'measurementUnit' | 'displayOrder' | 'isActive' | 'taskCount' | 'taskPolicy'
>

export interface KpiPeriodSummary {
  periodStart: string
  periodEnd: string
  numerator: number | null
  denominator: number | null
  actualValue: number | null
  targetAchievement: number | null
  status: 'MET' | 'NOT_MET' | 'NO_TARGET' | 'NO_DATA'
  manualNumerator: number | null
  manualDenominator: number | null
  manualValue: number | null
}
