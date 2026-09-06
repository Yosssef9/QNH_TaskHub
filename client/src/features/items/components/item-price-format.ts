export function formatProcurementNumber(value: number | null, locale: string, maximumFractionDigits = 4): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)
}

export function formatUnitCost(
  value: number | null,
  locale: string,
  currencyCode?: string | null,
  unitName?: string | null,
): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const number = formatProcurementNumber(value, locale)
  const currency = currencyCode?.trim() || ''
  const unit = unitName?.trim() || ''
  return `${number}${currency ? ` ${currency}` : ''}${unit ? ` / ${unit}` : ''}`
}

export function formatPercent(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}%`
}

export function formatDateOnly(value: string | null, locale: string): string {
  if (!value) return '—'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed)
}
