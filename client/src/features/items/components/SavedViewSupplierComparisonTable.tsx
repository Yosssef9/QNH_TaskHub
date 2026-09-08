import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  EyeOff,
  Minus,
  ReceiptText,
  SlidersHorizontal,
  Tags,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
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
  ItemSupplierMatrixPriceSource,
  ProcurementPricePeriod,
} from '../types/item.types'
import { formatDateOnly, formatPercent, formatUnitCost } from './item-price-format'
import {
  bestSupplierIds,
  comparisonPercent,
  effectiveComparisonGroups,
  effectiveComparisonPrice,
  metricValue,
  scopeKey,
  scopeLabel,
  scopesMatch,
  singleComparableBest,
  singleEffectiveComparisonWinners,
  type EffectiveComparisonEntry,
  type SinglePriceSource,
} from './supplier-comparison'
import { SupplierPriceDetailDrawer } from './SupplierPriceDetailDrawer'

const MAX_VISIBLE_SUPPLIERS = 5

interface SelectedPair {
  item: ItemListItem
  supplier: SearchableSelectOption
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
  priceSource,
  metric,
  settingsSaving,
  onVisibleSupplierIdsChange,
  onPriceSourceChange,
  onMetricChange,
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
  priceSource: ItemSupplierMatrixPriceSource
  metric: ItemSupplierMatrixMetric
  settingsSaving: boolean
  onVisibleSupplierIdsChange: (ids: number[]) => void
  onPriceSourceChange: (source: ItemSupplierMatrixPriceSource) => void
  onMetricChange: (metric: ItemSupplierMatrixMetric) => void
  onRetryMatrix: () => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
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

  const resultHeader =
    priceSource === 'actual'
      ? t('items.matrix.lowestActual')
      : priceSource === 'quote'
        ? t('items.matrix.lowestQuote')
        : t('items.matrix.bestChoice')

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
      <div className="bg-muted/15 flex flex-col gap-4 border-b px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold">{t('items.matrix.title')}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('items.matrix.description', { view: savedViewName })}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-muted-foreground mb-1.5 text-[11px] font-medium">
                {t('items.matrix.priceSourceLabel')}
              </p>
              <div
                role="group"
                aria-label={t('items.matrix.priceSourceLabel')}
                className="flex rounded-lg border bg-background p-1"
              >
                {(['actual', 'quote', 'compare'] as const).map((source) => (
                  <Button
                    key={source}
                    type="button"
                    size="sm"
                    variant={priceSource === source ? 'default' : 'ghost'}
                    disabled={settingsSaving}
                    className="h-8"
                    onClick={() => onPriceSourceChange(source)}
                  >
                    {source === 'actual' ? <ReceiptText className="size-3.5" /> : <Tags className="size-3.5" />}
                    {t(`items.matrix.priceSources.${source}`)}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-1.5 text-[11px] font-medium">
                {t('items.matrix.metricLabel')}
              </p>
              <Select
                value={metric}
                disabled={settingsSaving}
                onValueChange={(value) => onMetricChange(value as ItemSupplierMatrixMetric)}
              >
                <SelectTrigger className="w-44">
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
            </div>

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

        <p className="text-muted-foreground text-[11px]">
          {settingsSaving ? t('items.matrix.savingViewSettings') : t('items.matrix.settingsSavedWithView')}
        </p>
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
                      className="bg-accent min-w-[16rem] border-e border-b px-4 py-3 text-start align-top text-xs font-semibold"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <TableEntityLink kind="supplier" id={supplierId} name={supplier.label} code={supplier.description ?? null} compact className="min-w-0 max-w-[13rem]" />
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
                <th className="bg-accent min-w-[15rem] border-b px-4 py-3 text-start text-xs font-semibold">
                  {resultHeader}
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

                const singleSource = priceSource === 'compare' ? null : priceSource
                const bestIds = singleSource
                  ? bestSupplierIds(visibleCells, metric, singleSource)
                  : new Set<number>()
                const scopeGroups = singleSource
                  ? new Set(
                      visibleCells
                        .filter((cell) => metricValue(cell, metric, singleSource).value !== null)
                        .map((cell) => scopeKey(cell, singleSource)),
                    )
                  : new Set<string>()
                const singleBest =
                  singleSource && scopeGroups.size === 1
                    ? singleComparableBest(visibleCells, metric, singleSource)
                    : null
                const compareGroups = priceSource === 'compare'
                  ? effectiveComparisonGroups(visibleCells, metric)
                  : []
                const compareWinners = priceSource === 'compare'
                  ? singleEffectiveComparisonWinners(visibleCells, metric)
                  : null
                const compareWinnerIds = new Set(
                  (compareWinners ?? []).map((entry) => entry.cell.supplierId),
                )

                return (
                  <tr key={item.id} className="group">
                    <th className="bg-background group-hover:bg-muted sticky start-0 z-10 border-e border-b px-4 py-3 text-start align-top">
                      <TableEntityLink kind="item" id={item.id} name={item.name} code={item.code} to={`/items/${item.id}?view=${savedViewId}&period=${period}`} className="max-w-[22rem]" />
                      {item.categoryName ? (
                        <p className="text-muted-foreground mt-1 max-w-[20rem] truncate text-xs">
                          {item.categoryName}
                        </p>
                      ) : null}
                    </th>

                    {visibleSuppliers.map((supplier) => {
                      const supplierId = Number(supplier.value)
                      const cell = cellBySupplier.get(supplierId)
                      const isBest =
                        priceSource === 'compare'
                          ? compareWinnerIds.has(supplierId)
                          : Boolean(cell && bestIds.has(cell.supplierId))
                      return (
                        <td
                          key={supplierId}
                          className={cn(
                            'group-hover:bg-primary/[0.015] relative border-e border-b p-2 align-top',
                            isBest &&
                              'before:border-success/30 before:bg-success/[0.055] before:pointer-events-none before:absolute before:inset-2 before:z-0 before:rounded-lg before:border',
                          )}
                        >
                          <MatrixCell
                            cell={cell}
                            metric={metric}
                            priceSource={priceSource}
                            locale={locale}
                            isBest={isBest}
                            supplierName={supplier.label}
                            onOpen={() => setSelectedPair({ item, supplier })}
                          />
                        </td>
                      )
                    })}

                    <td className="group-hover:bg-primary/[0.015] border-b px-4 py-3 align-top">
                      {priceSource === 'compare' ? (
                        compareWinners ? (
                          <CompareResult winners={compareWinners} metric={metric} locale={locale} />
                        ) : compareGroups.length > 1 ? (
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
                        )
                      ) : singleBest ? (
                        <SingleSourceResult
                          cell={singleBest}
                          metric={metric}
                          source={priceSource}
                          locale={locale}
                        />
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

function SourceBlock({
  cell,
  metric,
  source,
  locale,
}: {
  cell: ItemSupplierMatrixCell
  metric: ItemSupplierMatrixMetric
  source: SinglePriceSource
  locale: string
}) {
  const { t } = useTranslation()
  const data = metricValue(cell, metric, source)
  const isQuote = source === 'quote'
  const change = isQuote ? cell.quoteChangePercent : cell.changePercent
  const count = isQuote ? cell.quoteCount : cell.transactionCount

  return (
    <div>
      <p className={cn(
        'flex items-center gap-1 text-[11px] font-semibold',
        isQuote ? 'text-primary' : 'text-foreground',
      )}>
        {isQuote ? <Tags className="size-3" /> : <ReceiptText className="size-3" />}
        {t(isQuote ? 'items.matrix.myQuote' : 'items.matrix.actualPurchase')}
      </p>
      <p dir="ltr" className="mt-1 text-base font-semibold tabular-nums">
        {formatUnitCost(
          data.value,
          locale,
          isQuote ? cell.quoteCurrencyCode : cell.currencyCode,
          isQuote ? cell.quoteUnitName : cell.unitName,
        )}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px]">{scopeLabel(cell, source)}</p>
      {data.date ? (
        <p className="text-muted-foreground mt-1 text-xs">{formatDateOnly(data.date, locale)}</p>
      ) : null}
      {metric === 'latest' && change !== null ? (
        <ChangeValue value={change} locale={locale} />
      ) : null}
      {metric === 'average' && count > 0 ? (
        <p className="text-muted-foreground mt-1 text-[11px]">
          {t(isQuote ? 'items.matrix.quoteCountValue' : 'items.analytics.transactionCountValue', { count })}
        </p>
      ) : null}
    </div>
  )
}

function MatrixCell({
  cell,
  metric,
  priceSource,
  locale,
  isBest,
  supplierName,
  onOpen,
}: {
  cell: ItemSupplierMatrixCell | undefined
  metric: ItemSupplierMatrixMetric
  priceSource: ItemSupplierMatrixPriceSource
  locale: string
  isBest: boolean
  supplierName: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const actual = metricValue(cell, metric, 'actual')
  const quote = metricValue(cell, metric, 'quote')
  const hasActual = actual.value !== null
  const hasQuote = quote.value !== null
  const hasRelevant =
    priceSource === 'actual'
      ? hasActual
      : priceSource === 'quote'
        ? hasQuote
        : hasActual || hasQuote
  const canOpen = Boolean(cell && (cell.latestUnitCost !== null || cell.latestQuoteUnitCost !== null))

  if (!cell || !hasRelevant) {
    const emptyKey =
      priceSource === 'actual'
        ? 'items.matrix.noActualHistory'
        : priceSource === 'quote'
          ? 'items.matrix.noQuoteHistory'
          : 'items.matrix.noPriceHistory'
    return (
      <div className="min-h-24 rounded-lg px-2 py-3">
        <p className="text-muted-foreground text-lg">—</p>
        <p className="text-muted-foreground mt-1 text-xs">{t(emptyKey)}</p>
      </div>
    )
  }

  const difference = comparisonPercent(cell, metric)
  const effective = priceSource === 'compare' ? effectiveComparisonPrice(cell, metric) : null

  return (
    <button
      type="button"
      disabled={!canOpen}
      className={cn(
        'focus-visible:ring-ring relative z-10 min-h-24 w-full rounded-lg border border-transparent bg-transparent p-3 text-start outline-none focus-visible:ring-2',
        canOpen ? 'hover:bg-muted/45' : 'cursor-default',
      )}
      aria-label={t('items.matrix.openDetails', { supplier: supplierName })}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-3">
          {priceSource !== 'quote' && hasActual ? (
            <SourceBlock cell={cell} metric={metric} source="actual" locale={locale} />
          ) : null}

          {priceSource === 'compare' && hasActual && hasQuote ? <div className="border-t" /> : null}

          {priceSource !== 'actual' && hasQuote ? (
            <SourceBlock cell={cell} metric={metric} source="quote" locale={locale} />
          ) : null}

          {priceSource === 'compare' && hasActual && hasQuote ? (
            scopesMatch(cell) ? (
              <div className="rounded-md bg-muted/45 px-2 py-1.5">
                <p className="text-muted-foreground text-[10px] font-medium">
                  {t('items.matrix.quoteVsActualMetric', {
                    metric: t(`items.matrix.metrics.${metric}`),
                  })}
                </p>
                <ChangeValue value={difference} locale={locale} compact />
              </div>
            ) : (
              <p className="text-warning-foreground text-[11px]">
                {t('items.matrix.quoteDifferentScope')}
              </p>
            )
          ) : null}

          {priceSource === 'compare' ? (
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-[10px] font-semibold">
                {t('items.matrix.priceUsedForComparison')}
              </p>
              {effective ? (
                <>
                  <p dir="ltr" className="mt-1 text-base font-bold tabular-nums">
                    {formatUnitCost(
                      effective.value,
                      locale,
                      effective.currencyCode,
                      effective.unitName,
                    )}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {t(
                      effective.source === 'quote'
                        ? 'items.matrix.comparisonUsesQuote'
                        : 'items.matrix.comparisonUsesActual',
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground mt-1 text-lg">—</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {t('items.matrix.noComparisonPrice')}
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>

        {isBest ? (
          <Badge variant="success" className="shrink-0">
            <Trophy className="me-1 size-3" />
            {priceSource === 'compare'
              ? t('items.matrix.bestPriceBadge')
              : t('items.matrix.bestInScope')}
          </Badge>
        ) : null}
      </div>
    </button>
  )
}

function ChangeValue({
  value,
  locale,
  compact = false,
}: {
  value: number | null
  locale: string
  compact?: boolean
}) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <p
      dir="ltr"
      className={cn(
        'inline-flex items-center gap-1 font-semibold',
        compact ? 'mt-0.5 text-xs' : 'mt-1 text-xs',
        value > 0
          ? 'text-destructive'
          : value < 0
            ? 'text-success'
            : 'text-muted-foreground',
      )}
    >
      {value > 0 ? (
        <ArrowUp className="size-3" />
      ) : value < 0 ? (
        <ArrowDown className="size-3" />
      ) : (
        <Minus className="size-3" />
      )}
      {formatPercent(value, locale)}
    </p>
  )
}

function SingleSourceResult({
  cell,
  metric,
  source,
  locale,
}: {
  cell: ItemSupplierMatrixCell
  metric: ItemSupplierMatrixMetric
  source: SinglePriceSource
  locale: string
}) {
  const { t } = useTranslation()
  const data = metricValue(cell, metric, source)
  const isQuote = source === 'quote'
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Trophy className="text-success size-4 shrink-0" />
        <TableEntityLink kind="supplier" id={cell.supplierId} name={cell.supplierName} code={cell.supplierCode} compact />
      </div>
      <p dir="ltr" className="mt-1 text-sm font-semibold tabular-nums">
        {formatUnitCost(
          data.value,
          locale,
          isQuote ? cell.quoteCurrencyCode : cell.currencyCode,
          isQuote ? cell.quoteUnitName : cell.unitName,
        )}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        {t(isQuote ? 'items.matrix.lowestQuoteBasedOnMetric' : 'items.matrix.lowestActualBasedOnMetric', {
          metric: t(`items.matrix.metrics.${metric}`),
        })}
      </p>
    </div>
  )
}

function CompareResult({
  winners,
  metric,
  locale,
}: {
  winners: EffectiveComparisonEntry[]
  metric: ItemSupplierMatrixMetric
  locale: string
}) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="space-y-3">
        {winners.map(({ cell, price }, index) => (
          <div key={cell.supplierId} className={cn(index > 0 && 'border-t pt-3')}>
            <div className="flex items-center gap-1.5">
              <Trophy className="text-success size-4 shrink-0" />
              <TableEntityLink kind="supplier" id={cell.supplierId} name={cell.supplierName} code={cell.supplierCode} compact />
            </div>
            <p dir="ltr" className="mt-1 text-sm font-semibold tabular-nums">
              {formatUnitCost(price.value, locale, price.currencyCode, price.unitName)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t(price.source === 'quote' ? 'items.matrix.comparisonUsesQuote' : 'items.matrix.comparisonUsesActual')}
            </p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        {winners.length > 1
          ? t('items.matrix.bestChoiceTieHint', { count: winners.length })
          : t('items.matrix.bestChoiceHint', {
              metric: t(`items.matrix.metrics.${metric}`),
            })}
      </p>
    </div>
  )
}

