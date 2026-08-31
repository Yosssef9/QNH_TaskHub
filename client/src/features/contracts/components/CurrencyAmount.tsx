import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

import { formatSarNumber } from './contract-display'

interface CurrencyAmountProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number | null
  mutedCurrency?: boolean
}

export function CurrencyAmount({
  value,
  mutedCurrency = true,
  className,
  ...props
}: CurrencyAmountProps) {
  if (value === null) return <span className={className}>—</span>

  return (
    <span
      dir="ltr"
      className={cn('inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums', className)}
      {...props}
    >
      <span>{formatSarNumber(value)}</span>
      <span
        className={cn(
          'text-[0.72em] font-semibold tracking-wide',
          mutedCurrency ? 'text-muted-foreground' : 'opacity-80',
        )}
      >
        SAR
      </span>
    </span>
  )
}
