import { useEffect, useMemo, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'

function normalizeDraft(value: string, maximumFractionDigits: number): string {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  if (!cleaned) return ''

  const firstDot = cleaned.indexOf('.')
  const integerRaw = firstDot >= 0 ? cleaned.slice(0, firstDot) : cleaned
  const decimalRaw = firstDot >= 0 ? cleaned.slice(firstDot + 1).replace(/\./g, '') : ''
  const integer = integerRaw.replace(/^0+(?=\d)/, '') || '0'
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  if (firstDot < 0 || maximumFractionDigits === 0) return grouped
  return `${grouped}.${decimalRaw.slice(0, maximumFractionDigits)}`
}

function numericValue(value: string): number | null {
  const normalized = value.replace(/,/g, '')
  if (!normalized || normalized === '.') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function MoneyInput({
  value,
  onChange,
  currencyCode = 'SAR',
  minimumFractionDigits = 0,
  maximumFractionDigits = 2,
  disabled = false,
  className,
  ariaLabel,
}: {
  value: number | null
  onChange: (value: number | null) => void
  currencyCode?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  disabled?: boolean
  className?: string | undefined
  ariaLabel?: string | undefined
}) {
  const focused = useRef(false)
  const maxDigits = Math.max(0, Math.min(maximumFractionDigits, 20))
  const minDigits = Math.max(0, Math.min(minimumFractionDigits, maxDigits))
  const formatter = useMemo(
    () => new Intl.NumberFormat('en-US', {
      useGrouping: true,
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    }),
    [maxDigits, minDigits],
  )
  const [draft, setDraft] = useState(() => (value === null ? '' : formatter.format(value)))

  useEffect(() => {
    if (!focused.current) setDraft(value === null ? '' : formatter.format(value))
  }, [formatter, value])

  return (
    <div dir="ltr" className={cn('relative', className)}>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        disabled={disabled}
        aria-label={ariaLabel}
        className="pe-14 text-end font-medium tabular-nums"
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => {
          const next = normalizeDraft(event.target.value, maxDigits)
          setDraft(next)
          onChange(numericValue(next))
        }}
        onBlur={() => {
          focused.current = false
          const next = numericValue(draft)
          setDraft(next === null ? '' : formatter.format(next))
          onChange(next)
        }}
      />
      <span
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute inset-y-0 end-3 flex items-center text-[11px] font-semibold tracking-wide"
      >
        {currencyCode}
      </span>
    </div>
  )
}
