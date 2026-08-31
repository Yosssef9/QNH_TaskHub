import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import type { ContractTrackingState } from '../types/contracts.types'
import { ContractStatusIndicator } from './ContractSelectIndicators'

export function ContractStatusBadge({
  state,
  daysRemaining,
  className,
}: {
  state: ContractTrackingState
  daysRemaining?: number | null
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <span className={cn('inline-flex flex-col items-start gap-1.5', className)}>
      <ContractStatusIndicator value={state} pill />
      {daysRemaining !== undefined && daysRemaining !== null ? (
        <span dir="ltr" className="text-muted-foreground text-xs tabular-nums">
          {daysRemaining >= 0
            ? t('contracts.daysRemaining', { count: daysRemaining })
            : t('contracts.daysPast', { count: Math.abs(daysRemaining) })}
        </span>
      ) : null}
    </span>
  )
}
