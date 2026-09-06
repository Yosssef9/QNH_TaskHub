import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  EyeOff,
  Minus,
  SlidersHorizontal,
  Tags,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import type {
  ItemListItem,
  ItemSupplierMatrixBatch,
  ItemSupplierMatrixCell,
  ItemSupplierMatrixMetric,
  ProcurementPricePeriod,
} from '../types/item.types'
import { formatDateOnly, formatPercent, formatUnitCost } from './item-price-format'
import { SupplierPriceDetailDrawer } from './SupplierPriceDetailDrawer'

const MAX_VISIBLE_SUPPLIERS = 5

interface SelectedPair {
  item: ItemListItem
  supplier: SearchableSelectOption
}

interface MetricValue {
  value: number | null
  date: string | null
}

function metricValue(
  cell: ItemSupplierMatrixCell | undefined,
  metric: ItemSupplierMatrixMetric,
): MetricValue {
  if (!cell) return { value: null, date: null }
  if (metric === 'latest') return { value: cell.latestUnitCost, date: cell.latestTransactionDate }
  if (metric === 'previous')
    return { value: cell.previousUnitCost, date: cell.previousTransactionDate }
  if (metric === 'lowest') return { value: cell.lowestUnitCost, date: cell.lowestTransactionDate }
  if (metric === 'highest')
    return { value: cell.highestUnitCost, date: cell.highestTransactionDate }
  return { value: cell.averageUnitCost, date: cell.lastPurchaseDate }
}

function scopeKey(cell: ItemSupplierMatrixCell): string {
  return `${cell.currencyCode ?? ''}\u0000${cell.unitName ?? ''}`
}

function scopeLabel(cell: ItemSupplierMatrixCell): string {
  return [cell.currencyCode, cell.unitName].filter(Boolean).join(' / ') || '—'
}

function quoteComparable(cell: ItemSupplierMatrixCell): boolean {
  if (cell.latestQuoteUnitCost === null || cell.latestUnitCost === null) return false
  return (
    (cell.quoteCurrencyCode ?? '') === (cell.currencyCode ?? '') &&
    (cell.quoteUnitName ?? '') === (cell.unitName ?? '')
  )
}

function bestSupplierIds(
  cells: ItemSupplierMatrixCell[],
  metric: ItemSupplierMatrixMetric,
): Set<number> {
  const groups = new Map<string, Array<{ supplierId: number; value: number }>>()
  for (const cell of cells) {
    const value = metricValue(cell, metric).value
    if (value === null) continue
    const key = scopeKey(cell)
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

function singleComparableBest(
  cells: ItemSupplierMatrixCell[],
  metric: ItemSupplierMatrixMetric,
): ItemSupplierMatrixCell | null {
  const groups = new Map<string, ItemSupplierMatrixCell[]>()
  for (const cell of cells) {
    if (metricValue(cell, metric).value === null) continue
    const key = scopeKey(cell)
    const current = groups.get(key) ?? []
    current.push(cell)
    groups.set(key, current)
  }
  const comparableGroups = [...groups.values()].filter((group) => group.length >= 2)
  if (comparableGroups.length !== 1) return null
  return (
    comparableGroups[0]
      .slice()
      .sort(
        (left, right) =>
          (metricValue(left, metric).value ?? Number.POSITIVE_INFINITY) -
          (metricValue(right, metric).value ?? Number.POSITIVE_INFINITY),
      )[0] ?? null
  )
}

export function SavedViewSupplierComparisonTable({
  savedViewId,
  savedViewName,
  items,
  suppliers,
  period,
  matrixData,
  matrixLoading,
  matrixError,
  visibleSupplierIds,
  onVisibleSupplierIdsChange,
  onRetryMatrix,
}: {
  savedViewId: number
  savedViewName: string
  items: ItemListItem[]
  suppliers: SearchableSelectOption[]
  period: ProcurementPricePeriod
  matrixData: ItemSupplierMatrixBatch | undefined
  matrixLoading: boolean
  matrixError: boolean
  visibleSupplierIds: number[]
  onVisibleSupplierIdsChange: (ids: number[]) => void
  onRetryMatrix: () => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const [metric, setMetric] = useState<ItemSupplierMatrixMetric>('latest')
  const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null)

  const matrixByItem = useMemo(
    () => new Map((matrixData?.items ?? []).map((entry) => [entry.itemId, entry.suppliers])),
    [matrixData],
  )
  const visibleSuppliers = suppliers.filter((supplier) =>
    visibleSupplierIds.includes(Number(supplier.value)),
  )

  function toggleSupplier(supplierId: number) {
    let next = visibleSupplierIds
    if (visibleSupplierIds.includes(supplierId)) {
      if (visibleSupplierIds.length <= 1) return
      next = visibleSupplierIds.filter((id) => id !== supplierId)
    } else {
      if (visibleSupplierIds.length >= MAX_VISIBLE_SUPPLIERS) return
      next = [...visibleSupplierIds, supplierId]
    }
    onVisibleSupplierIdsChange(next)
  }

  if (suppliers.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="font-semibold">{t('items.matrix.noSuppliersTitle')}</p>
        <p className="text-muted-foreground mt-2 text-sm">
          {t('items.matrix.noSuppliersDescription')}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-muted/15 flex flex-col gap-3 border-b px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-semibold">{t('items.matrix.title')}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('items.matrix.description', { view: savedViewName })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as ItemSupplierMatrixMetric)}
          >
            <SelectTrigger className="w-44" aria-label={t('items.matrix.metricLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">{t('items.matrix.metrics.latest')}</SelectItem>
              <SelectItem value="previous">{t('items.matrix.metrics.previous')}</SelectItem>
              <SelectItem value="lowest">{t('items.matrix.metrics.lowest')}</SelectItem>
              <SelectItem value="highest">{t('items.matrix.metrics.highest')}</SelectItem>
              <SelectItem value="average">{t('items.matrix.metrics.average')}</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <SlidersHorizontal className="size-4" />
                {t('items.matrix.suppliersShown', {
                  shown: visibleSuppliers.length,
                  total: suppliers.length,
                })}
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-2">
              <p className="px-2 py-1 text-sm font-semibold">{t('items.matrix.chooseSuppliers')}</p>
              <p className="text-muted-foreground px-2 pb-2 text-xs">
                {t('items.matrix.chooseSuppliersHint', { max: MAX_VISIBLE_SUPPLIERS })}
              </p>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {suppliers.map((supplier) => {
                  const supplierId = Number(supplier.value)
                  const checked = visibleSupplierIds.includes(supplierId)
                  const disabled = !checked && visibleSupplierIds.length >= MAX_VISIBLE_SUPPLIERS
                  return (
                    <button
                      key={supplierId}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        'hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm',
                        disabled && 'cursor-not-allowed opacity-45',
                      )}
                      onClick={() => toggleSupplier(supplierId)}
                    >
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded border',
                          checked && 'border-primary bg-primary text-primary-foreground',
                        )}
                      >
                        {checked ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{supplier.label}</span>
                        {supplier.description ? (
                          <span
                            dir="ltr"
                            className="text-muted-foreground block truncate font-mono text-[11px]"
                          >
                            {supplier.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {matrixLoading ? (
        <div className="text-muted-foreground px-4 py-12 text-center text-sm">
          {t('items.matrix.loading')}
        </div>
      ) : matrixError || !matrixData ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="font-semibold">{t('items.matrix.errorTitle')}</p>
          <p className="text-muted-foreground text-sm">{t('items.matrix.errorDescription')}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetryMatrix}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="bg-accent sticky start-0 z-30 min-w-[18rem] border-e border-b px-4 py-3 text-start text-xs font-semibold">
                  {t('items.name')}
                </th>
                {visibleSuppliers.map((supplier) => {
                  const supplierId = Number(supplier.value)
                  return (
                    <th
                      key={supplierId}
                      className="bg-accent min-w-[15rem] border-e border-b px-4 py-3 text-start align-top text-xs font-semibold"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate">{supplier.label}</p>
                          {supplier.description ? (
                            <p
                              dir="ltr"
                              className="text-muted-foreground mt-1 truncate font-mono text-[11px]"
                            >
                              {supplier.description}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          aria-label={t('items.matrix.hideSupplier', { supplier: supplier.label })}
                          disabled={visibleSuppliers.length <= 1}
                          onClick={() => toggleSupplier(supplierId)}
                        >
                          <EyeOff className="size-3.5" />
                        </Button>
                      </div>
                    </th>
                  )
                })}
                <th className="bg-accent min-w-[14rem] border-b px-4 py-3 text-start text-xs font-semibold">
                  {t('items.matrix.bestSupplier')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const rowCells = matrixByItem.get(item.id) ?? []
                const cellBySupplier = new Map(rowCells.map((cell) => [cell.supplierId, cell]))
                const visibleCells = visibleSuppliers
                  .map((supplier) => cellBySupplier.get(Number(supplier.value)))
                  .filter((cell): cell is ItemSupplierMatrixCell => Boolean(cell))
                const bestIds = bestSupplierIds(visibleCells, metric)
                const scopeGroups = new Set(
                  visibleCells
                    .filter((cell) => metricValue(cell, metric).value !== null)
                    .map(scopeKey),
                )
                const singleBest =
                  scopeGroups.size === 1 ? singleComparableBest(visibleCells, metric) : null

                return (
                  <tr key={item.id} className="group">
                    <th className="bg-background group-hover:bg-muted sticky start-0 z-10 border-e border-b px-4 py-3 text-start align-top">
                      <p className="max-w-[22rem] font-semibold">{item.name}</p>
                      <p dir="ltr" className="text-muted-foreground mt-1 font-mono text-xs">
                        {item.code}
                      </p>
                      {item.categoryName ? (
                        <p className="text-muted-foreground mt-1 max-w-[20rem] truncate text-xs">
                          {item.categoryName}
                        </p>
                      ) : null}
                    </th>
                    {visibleSuppliers.map((supplier) => {
                      const supplierId = Number(supplier.value)
                      const cell = cellBySupplier.get(supplierId)
                      return (
                        <td
                          key={supplierId}
                          className="group-hover:bg-primary/[0.015] border-e border-b p-2 align-top"
                        >
                          <MatrixCell
                            cell={cell}
                            metric={metric}
                            locale={locale}
                            isBest={cell ? bestIds.has(cell.supplierId) : false}
                            supplierName={supplier.label}
                            onOpen={() => setSelectedPair({ item, supplier })}
                          />
                        </td>
                      )
                    })}
                    <td className="group-hover:bg-primary/[0.015] border-b px-4 py-3 align-top">
                      {singleBest ? (
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold">
                            <Trophy className="text-success size-4" />
                            {singleBest.supplierName}
                          </div>
                          <p dir="ltr" className="mt-1 text-sm font-semibold tabular-nums">
                            {formatUnitCost(
                              metricValue(singleBest, metric).value,
                              locale,
                              singleBest.currencyCode,
                              singleBest.unitName,
                            )}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {t('items.matrix.bestBasedOnMetric', {
                              metric: t(`items.matrix.metrics.${metric}`),
                            })}
                          </p>
                        </div>
                      ) : scopeGroups.size > 1 ? (
                        <div>
                          <p className="font-medium">{t('items.matrix.multipleScopes')}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {t('items.matrix.multipleScopesHint')}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t('items.matrix.noComparableBest')}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedPair ? (
        <SupplierPriceDetailDrawer
          key={`${savedViewId}-${selectedPair.item.id}-${selectedPair.supplier.value}`}
          open
          item={selectedPair.item}
          supplier={selectedPair.supplier}
          period={period}
          onOpenChange={(open) => {
            if (!open) setSelectedPair(null)
          }}
        />
      ) : null}
    </>
  )
}

function MatrixCell({
  cell,
  metric,
  locale,
  isBest,
  supplierName,
  onOpen,
}: {
  cell: ItemSupplierMatrixCell | undefined
  metric: ItemSupplierMatrixMetric
  locale: string
  isBest: boolean
  supplierName: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const metricData = metricValue(cell, metric)
  const hasActual = metricData.value !== null
  const hasQuote = Boolean(
    cell?.latestQuoteUnitCost !== null && cell?.latestQuoteUnitCost !== undefined,
  )
  const canOpen = Boolean(cell && (cell.latestUnitCost !== null || hasQuote))

  if (!cell || (!hasActual && !hasQuote)) {
    return (
      <div className="min-h-24 rounded-lg px-2 py-3">
        <p className="text-muted-foreground text-lg">—</p>
        <p className="text-muted-foreground mt-1 text-xs">{t('items.matrix.noActualHistory')}</p>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={!canOpen}
      className={cn(
        'focus-visible:ring-ring min-h-24 w-full rounded-lg border p-3 text-start outline-none focus-visible:ring-2',
        canOpen ? 'hover:bg-muted/45' : 'cursor-default',
        isBest ? 'border-success/30 bg-success/[0.055]' : 'border-transparent',
      )}
      aria-label={t('items.matrix.openDetails', { supplier: supplierName })}
      onClick={onOpen}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p dir="ltr" className="text-base font-semibold tabular-nums">
            {formatUnitCost(metricData.value, locale, cell.currencyCode, cell.unitName)}
          </p>
          {hasActual ? (
            <p className="text-muted-foreground mt-1 text-[11px]">{scopeLabel(cell)}</p>
          ) : (
            <p className="text-muted-foreground mt-1 text-[11px]">
              {t('items.matrix.noActualHistory')}
            </p>
          )}
        </div>
        {isBest ? (
          <Badge variant="success">
            <Trophy className="me-1 size-3" />
            {t('items.matrix.bestInScope')}
          </Badge>
        ) : null}
      </div>

      {metric === 'latest' && cell.changePercent !== null ? (
        <p
          dir="ltr"
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-xs font-semibold',
            cell.changePercent > 0
              ? 'text-destructive'
              : cell.changePercent < 0
                ? 'text-success'
                : 'text-muted-foreground',
          )}
        >
          {cell.changePercent > 0 ? (
            <ArrowUp className="size-3" />
          ) : cell.changePercent < 0 ? (
            <ArrowDown className="size-3" />
          ) : (
            <Minus className="size-3" />
          )}
          {formatPercent(cell.changePercent, locale)}
        </p>
      ) : null}

      {metricData.date ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {formatDateOnly(metricData.date, locale)}
        </p>
      ) : null}
      {metric === 'average' && cell.transactionCount > 0 ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {t('items.analytics.transactionCountValue', { count: cell.transactionCount })}
        </p>
      ) : null}

      {hasQuote ? (
        <div className="mt-2 border-t pt-2">
          <p className="flex items-center gap-1 text-[11px] font-medium">
            <Tags className="size-3" />
            {t('items.matrix.myLatestQuote')}
          </p>
          <p dir="ltr" className="mt-0.5 text-xs font-semibold tabular-nums">
            {formatUnitCost(
              cell.latestQuoteUnitCost,
              locale,
              cell.quoteCurrencyCode,
              cell.quoteUnitName,
            )}
          </p>
          {cell.latestQuoteDate ? (
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {formatDateOnly(cell.latestQuoteDate, locale)}
            </p>
          ) : null}
          {cell.latestUnitCost !== null && !quoteComparable(cell) ? (
            <p className="text-warning-foreground mt-1 text-[11px]">
              {t('items.matrix.quoteDifferentScope')}
            </p>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}
