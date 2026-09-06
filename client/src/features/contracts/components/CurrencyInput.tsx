import { MoneyInput } from '@/components/shared/MoneyInput'

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
  return (
    <MoneyInput
      value={value}
      onChange={onChange}
      currencyCode="SAR"
      minimumFractionDigits={2}
      maximumFractionDigits={2}
      disabled={disabled}
      className={className}
      ariaLabel={ariaLabel}
    />
  )
}
