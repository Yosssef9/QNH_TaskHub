import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'

import { formatSarNumber } from './contract-display'

function normalizeDraft(value: string): string {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  if (!cleaned) return ''

  const firstDot = cleaned.indexOf('.')
  const integerRaw = firstDot >= 0 ? cleaned.slice(0, firstDot) : cleaned
  const decimalRaw = firstDot >= 0 ? cleaned.slice(firstDot + 1).replace(/\./g, '') : ''
  const integer = integerRaw.replace(/^0+(?=\d)/, '') || '0'
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return firstDot >= 0 ? `${grouped}.${decimalRaw.slice(0, 2)}` : grouped
}

function numericValue(value: string): number | null {
  const normalized = value.replace(/,/g, '')
  if (!normalized || normalized === '.') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function CurrencyInput({
  value,
  onChange,
  disabled = false,
  className,
  ariaLabel,
}: {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  const focused = useRef(false)
  const [draft, setDraft] = useState(() => (value === null ? '' : formatSarNumber(value)))

  useEffect(() => {
    if (!focused.current) setDraft(value === null ? '' : formatSarNumber(value))
  }, [value])

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
          const next = normalizeDraft(event.target.value)
          setDraft(next)
          onChange(numericValue(next))
        }}
        onBlur={() => {
          focused.current = false
          const next = numericValue(draft)
          setDraft(next === null ? '' : formatSarNumber(next))
          onChange(next)
        }}
      />
      <span
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute inset-y-0 end-3 flex items-center text-[11px] font-semibold tracking-wide"
      >
        SAR
      </span>
    </div>
  )
}
