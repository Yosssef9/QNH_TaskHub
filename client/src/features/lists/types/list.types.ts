export const LIST_ICON_KEYS = [
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

export const LIST_COLORS = [
  '#2563EB',
  '#0891B2',
  '#0D9488',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#7C3AED',
] as const

export type ListIconKey = (typeof LIST_ICON_KEYS)[number]
export type ListColor = (typeof LIST_COLORS)[number]

export interface PersonalList {
  id: number
  name: string
  iconKey: ListIconKey
  color: ListColor
  isDefault: boolean
  displayOrder: number
}

export interface SaveListInput {
  name: string
  iconKey: ListIconKey
  color: ListColor
}
