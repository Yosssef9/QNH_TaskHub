import type {
  ItemSupplierMatrixCell,
  ItemSupplierMatrixMetric,
  ItemSupplierMatrixPriceSource,
} from '../types/item.types'

export interface MetricValue {
  value: number | null
  date: string | null
}

export type SinglePriceSource = Exclude<ItemSupplierMatrixPriceSource, 'compare'>

export interface EffectiveComparisonPrice {
  value: number
  date: string | null
  source: SinglePriceSource
  currencyCode: string | null
  unitName: string | null
}

export interface EffectiveComparisonEntry {
  cell: ItemSupplierMatrixCell
  price: EffectiveComparisonPrice
}

export interface EffectiveComparisonGroup {
  key: string
  entries: EffectiveComparisonEntry[]
}

export function metricValue(
  cell: ItemSupplierMatrixCell | undefined,
  metric: ItemSupplierMatrixMetric,
  source: SinglePriceSource,
): MetricValue {
  if (!cell) return { value: null, date: null }

  if (source === 'quote') {
    if (metric === 'latest') return { value: cell.latestQuoteUnitCost, date: cell.latestQuoteDate }
    if (metric === 'previous') return { value: cell.previousQuoteUnitCost, date: cell.previousQuoteDate }
    if (metric === 'lowest') return { value: cell.lowestQuoteUnitCost, date: cell.lowestQuoteDate }
    if (metric === 'highest') return { value: cell.highestQuoteUnitCost, date: cell.highestQuoteDate }
    return { value: cell.averageQuoteUnitCost, date: cell.lastQuoteDate }
  }

  if (metric === 'latest') return { value: cell.latestUnitCost, date: cell.latestTransactionDate }
  if (metric === 'previous') return { value: cell.previousUnitCost, date: cell.previousTransactionDate }
  if (metric === 'lowest') return { value: cell.lowestUnitCost, date: cell.lowestTransactionDate }
  if (metric === 'highest') return { value: cell.highestUnitCost, date: cell.highestTransactionDate }
  return { value: cell.averageUnitCost, date: cell.lastPurchaseDate }
}

export function scopeKey(cell: ItemSupplierMatrixCell, source: SinglePriceSource): string {
  return source === 'quote'
    ? `${cell.quoteCurrencyCode ?? ''}\u0000${cell.quoteUnitName ?? ''}`
    : `${cell.currencyCode ?? ''}\u0000${cell.unitName ?? ''}`
}

export function scopeLabel(cell: ItemSupplierMatrixCell, source: SinglePriceSource): string {
  const values = source === 'quote'
    ? [cell.quoteCurrencyCode, cell.quoteUnitName]
    : [cell.currencyCode, cell.unitName]
  return values.filter(Boolean).join(' / ') || '—'
}

export function scopesMatch(cell: ItemSupplierMatrixCell): boolean {
  return (
    (cell.quoteCurrencyCode ?? '') === (cell.currencyCode ?? '')
    && (cell.quoteUnitName ?? '') === (cell.unitName ?? '')
  )
}

export function comparisonPercent(
  cell: ItemSupplierMatrixCell | undefined,
  metric: ItemSupplierMatrixMetric,
): number | null {
  if (!cell || !scopesMatch(cell)) return null
  const actual = metricValue(cell, metric, 'actual').value
  const quote = metricValue(cell, metric, 'quote').value
  if (actual === null || quote === null || actual === 0) return null
  return ((quote - actual) / actual) * 100
}

export function bestSupplierIds(
  cells: ItemSupplierMatrixCell[],
  metric: ItemSupplierMatrixMetric,
  source: SinglePriceSource,
): Set<number> {
  const groups = new Map<string, Array<{ supplierId: number; value: number }>>()
  for (const cell of cells) {
    const value = metricValue(cell, metric, source).value
    if (value === null) continue
    const key = scopeKey(cell, source)
    const current = groups.get(key) ?? []
    current.push({ supplierId: cell.supplierId, value })
    groups.set(key, current)
  }

  const result = new Set<number>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const lowest = Math.min(...group.map((entry) => entry.value))
    for (const entry of group) {
      if (entry.value === lowest) result.add(entry.supplierId)
    }
  }
  return result
}

export function singleComparableBest(
  cells: ItemSupplierMatrixCell[],
  metric: ItemSupplierMatrixMetric,
  source: SinglePriceSource,
): ItemSupplierMatrixCell | null {
  const groups = new Map<string, ItemSupplierMatrixCell[]>()
  for (const cell of cells) {
    if (metricValue(cell, metric, source).value === null) continue
    const key = scopeKey(cell, source)
    const current = groups.get(key) ?? []
    current.push(cell)
    groups.set(key, current)
  }
  const comparableGroups = [...groups.values()].filter((group) => group.length >= 2)
  if (comparableGroups.length !== 1) return null
  const comparableGroup = comparableGroups[0]
  if (!comparableGroup) return null

  return (
    comparableGroup
      .slice()
      .sort(
        (left, right) =>
          (metricValue(left, metric, source).value ?? Number.POSITIVE_INFINITY)
          - (metricValue(right, metric, source).value ?? Number.POSITIVE_INFINITY),
      )[0] ?? null
  )
}

/**
 * Compare mode business rule:
 * - when compatible Actual Purchase and Quote values both exist for the selected metric, use the lower value;
 * - if no Actual history exists, a Quote can establish the comparison scope by itself;
 * - if only one usable source exists, use that source;
 * - never use an incompatible Quote to outrank a compatible Actual Purchase;
 * - on an exact Actual/Quote tie, keep Quote as the deterministic displayed source.
 */
export function effectiveComparisonPrice(
  cell: ItemSupplierMatrixCell | undefined,
  metric: ItemSupplierMatrixMetric,
): EffectiveComparisonPrice | null {
  if (!cell) return null

  const quote = metricValue(cell, metric, 'quote')
  const actual = metricValue(cell, metric, 'actual')
  const hasActualHistory = cell.transactionCount > 0
  const quoteIsUsable = quote.value !== null && (!hasActualHistory || scopesMatch(cell))

  if (actual.value !== null && quoteIsUsable && quote.value !== null) {
    if (actual.value < quote.value) {
      return {
        value: actual.value,
        date: actual.date,
        source: 'actual',
        currencyCode: cell.currencyCode,
        unitName: cell.unitName,
      }
    }

    return {
      value: quote.value,
      date: quote.date,
      source: 'quote',
      currencyCode: cell.quoteCurrencyCode,
      unitName: cell.quoteUnitName,
    }
  }

  if (quoteIsUsable && quote.value !== null) {
    return {
      value: quote.value,
      date: quote.date,
      source: 'quote',
      currencyCode: cell.quoteCurrencyCode,
      unitName: cell.quoteUnitName,
    }
  }

  if (actual.value !== null) {
    return {
      value: actual.value,
      date: actual.date,
      source: 'actual',
      currencyCode: cell.currencyCode,
      unitName: cell.unitName,
    }
  }

  return null
}

function effectiveScopeKey(price: EffectiveComparisonPrice): string {
  return `${price.currencyCode ?? ''}\u0000${price.unitName ?? ''}`
}

export function effectiveComparisonGroups(
  cells: ItemSupplierMatrixCell[],
  metric: ItemSupplierMatrixMetric,
): EffectiveComparisonGroup[] {
  const groups = new Map<string, EffectiveComparisonEntry[]>()

  for (const cell of cells) {
    const price = effectiveComparisonPrice(cell, metric)
    if (!price) continue
    const key = effectiveScopeKey(price)
    const current = groups.get(key) ?? []
    current.push({ cell, price })
    groups.set(key, current)
  }

  return [...groups.entries()].map(([key, entries]) => ({ key, entries }))
}

export function singleEffectiveComparisonWinners(
  cells: ItemSupplierMatrixCell[],
  metric: ItemSupplierMatrixMetric,
): EffectiveComparisonEntry[] | null {
  const groups = effectiveComparisonGroups(cells, metric)
  if (groups.length !== 1) return null

  const entries = groups[0]?.entries ?? []
  if (entries.length < 2) return null

  const lowest = Math.min(...entries.map((entry) => entry.price.value))
  return entries.filter((entry) => entry.price.value === lowest)
}

