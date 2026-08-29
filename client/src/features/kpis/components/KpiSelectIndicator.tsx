import { cn } from '@/lib/cn'

import type { PersonalKpi } from '../types/kpi.types'
import { kpiIcons } from './kpi-icons'

export function KpiSelectIndicator({ kpi, pill = false }: { kpi: PersonalKpi; pill?: boolean }) {
  const Icon = kpiIcons[kpi.iconKey]

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 text-start',
        pill && 'rounded-full border px-2.5 py-1 text-xs font-medium',
      )}
      style={
        pill ? { borderColor: `${kpi.color}40`, backgroundColor: `${kpi.color}12` } : undefined
      }
    >
      <Icon className="size-4 shrink-0" style={{ color: kpi.color }} />
      <span className="truncate">{kpi.name}</span>
    </span>
  )
}
