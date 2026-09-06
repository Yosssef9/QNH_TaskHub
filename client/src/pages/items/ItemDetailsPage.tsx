import { Activity, Check, Info, Minus, Pencil, TriangleAlert } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams, useSearchParams } from 'react-router'

import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ItemEditorDialog } from '@/features/items/components/ItemEditorDialog'
import { ItemPriceFilters } from '@/features/items/components/ItemPriceFilters'
import { ItemPriceHistoryChart } from '@/features/items/components/ItemPriceHistoryChart'
import { ItemPriceSummaryCards } from '@/features/items/components/ItemPriceSummaryCards'
import { ItemSourceBadge } from '@/features/items/components/ItemSourceBadge'
import { ItemSupplierComparisonTable } from '@/features/items/components/ItemSupplierComparisonTable'
import { ItemTransactionsTable } from '@/features/items/components/ItemTransactionsTable'
import {
  useItem,
  useItemActivity,
  useItemAnalytics,
  useItemPriceHistory,
  useItemSupplierComparison,
  useItemTransactions,
} from '@/features/items/hooks/use-items'
import type {
  ItemSupplierSortBy,
  ItemTransactionSortBy,
  ProcurementPricePeriod,
} from '@/features/items/types/item.types'
import { useProcurementSavedView } from '@/features/procurement-saved-views/hooks/use-procurement-saved-views'
import { PriceQuoteScopePanel } from '@/features/price-quotes/components/PriceQuoteScopePanel'
import { useSupplier } from '@/features/suppliers/hooks/use-suppliers'
import { useSortState } from '@/hooks/use-sort-state'

export function ItemDetailsPage() {
  const { t, i18n } = useTranslation()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawId = Number(params.itemId)
  const itemId = Number.isSafeInteger(rawId) && rawId !== 0 ? rawId : null
  const rawViewId = Number(searchParams.get('view'))
  const savedViewId = Number.isSafeInteger(rawViewId) && rawViewId > 0 ? rawViewId : null
  const routeSupplierIds = useMemo(() => {
    const seen = new Set<number>()
    const ids: number[] = []

    for (const rawValue of searchParams.getAll('supplier')) {
      for (const part of rawValue.split(',')) {
        const id = Number(part)
        if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue
        seen.add(id)
        ids.push(id)
      }
    }

    return ids
  }, [searchParams])
  const routeSupplierIdsKey = routeSupplierIds.join(',')
  const routePeriod = searchParams.get('period')
  const initialPeriod: ProcurementPricePeriod =
    routePeriod === '1M' || routePeriod === '3M' || routePeriod === '6M' || routePeriod === '1Y' || routePeriod === 'ALL'
      ? routePeriod
      : '1Y'
  const savedView = useProcurementSavedView(savedViewId)
  const routePrimarySupplierId = savedViewId ? null : (routeSupplierIds[0] ?? null)
  const routeSupplier = useSupplier(routePrimarySupplierId)
  const itemQuery = useItem(itemId)
  const activity = useItemActivity(itemId)
  const [editOpen, setEditOpen] = useState(false)
  const [period, setPeriod] = useState<ProcurementPricePeriod>(initialPeriod)
  const [supplierIds, setSupplierIds] = useState<number[]>(savedViewId ? [] : routeSupplierIds)
  const [selectedSuppliers, setSelectedSuppliers] = useState<SearchableSelectOption[]>([])
  const [supplierPage, setSupplierPage] = useState(1)
  const [supplierPageSize, setSupplierPageSize] = useState(10)
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactionPageSize, setTransactionPageSize] = useState(25)
  const supplierSort = useSortState<ItemSupplierSortBy>('latest', 'asc')
  const transactionSort = useSortState<ItemTransactionSortBy>('transactionDate', 'desc')

  useEffect(() => {
    if (savedViewId) return

    const routeIds = routeSupplierIdsKey
      ? routeSupplierIdsKey.split(',').map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
      : []

    setPeriod(initialPeriod)
    setSupplierIds(routeIds)
    setSelectedSuppliers((current) => {
      const known = new Map(current.map((entry) => [Number(entry.value), entry]))
      if (routeSupplier.data && routeIds.includes(routeSupplier.data.id)) {
        known.set(routeSupplier.data.id, {
          value: routeSupplier.data.id,
          label: routeSupplier.data.name,
          description: routeSupplier.data.code,
        })
      }

      return routeIds.map((id) => known.get(id) ?? {
        value: id,
        label: t('items.analytics.supplierFallback', { id }),
        description: String(id),
      })
    })
    setSupplierPage(1)
    setTransactionPage(1)
  }, [initialPeriod, routeSupplier.data, routeSupplierIdsKey, savedViewId, t])

  useEffect(() => {
    if (savedViewId && savedView.data) {
      setPeriod(savedView.data.config.period)
      setSupplierIds(savedView.data.config.supplierIds)
      setSelectedSuppliers(savedView.data.selectedSuppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: supplier.code,
      })))
      setSupplierPage(1)
      setTransactionPage(1)
    }
  }, [savedView.data, savedViewId])

  const priceFilter = useMemo(() => ({ period, ...(supplierIds.length ? { supplierIds } : {}) }), [period, supplierIds])
  const analytics = useItemAnalytics(itemId, priceFilter)
  const history = useItemPriceHistory(itemId, { ...priceFilter, maxPoints: 1000 })
  const supplierComparison = useItemSupplierComparison(itemId, {
    ...priceFilter,
    page: supplierPage,
    pageSize: supplierIds.length >= 2 && supplierIds.length <= 5 ? Math.max(5, supplierIds.length) : supplierPageSize,
    sortBy: supplierSort.sortColumn ?? 'latest',
    sortDirection: supplierSort.sortDirection,
  })
  const transactions = useItemTransactions(itemId, {
    ...priceFilter,
    page: transactionPage,
    pageSize: transactionPageSize,
    sortBy: transactionSort.sortColumn ?? 'transactionDate',
    sortDirection: transactionSort.sortDirection,
  })

  if (itemId === null) return <Navigate to="/items" replace />
  if (itemQuery.isPending) return <LoadingState />
  if (itemQuery.isError || !itemQuery.data) return <ErrorState onRetry={() => void itemQuery.refetch()} />
  const item = itemQuery.data
  const itemsPath = savedViewId ? `/items?view=${savedViewId}` : '/items'

  function syncRouteScope(nextPeriod: ProcurementPricePeriod, nextSupplierIds: number[]) {
    if (savedViewId) return

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('supplier')
    nextParams.delete('period')
    nextParams.delete('view')

    if (nextPeriod !== '1Y') nextParams.set('period', nextPeriod)
    nextSupplierIds.forEach((id) => nextParams.append('supplier', String(id)))
    setSearchParams(nextParams, { replace: true })
  }

  function resetScope() {
    if (savedView.data) {
      setPeriod(savedView.data.config.period)
      setSupplierIds(savedView.data.config.supplierIds)
      setSelectedSuppliers(savedView.data.selectedSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: supplier.code })))
    } else {
      setPeriod('1Y')
      setSupplierIds([])
      setSelectedSuppliers([])
      syncRouteScope('1Y', [])
    }
    setSupplierPage(1)
    setTransactionPage(1)
  }

  function changePeriod(value: ProcurementPricePeriod) {
    setPeriod(value)
    syncRouteScope(value, supplierIds)
    setSupplierPage(1)
    setTransactionPage(1)
  }

  function changeSupplierIds(ids: number[]) {
    setSupplierIds(ids)
    syncRouteScope(period, ids)
    setSupplierPage(1)
    setTransactionPage(1)
  }

  const resetBaselinePeriod = savedView.data?.config.period ?? '1Y'
  const resetBaselineSupplierIds = savedView.data?.config.supplierIds ?? []
  const resetDisabled = savedViewId
    ? !savedView.data || (
      period === resetBaselinePeriod
      && sameNumberSet(supplierIds, resetBaselineSupplierIds)
    )
    : period === '1Y' && supplierIds.length === 0

  return <div className="space-y-6">
    <Breadcrumbs items={[{ label: t('procurement.title') }, { label: t('items.pageTitle'), path: itemsPath }, { label: item.name }]} />
    <PageHeader eyebrow={t('items.codeValue', { code: item.code })} title={item.name} description={item.parentName ?? t('items.detailsDescription')} actions={<Button onClick={() => setEditOpen(true)}><Pencil className="size-4" />{t('common.edit')}</Button>} />

    <ItemPriceFilters
      period={period}
      supplierIds={supplierIds}
      selectedSuppliers={selectedSuppliers}
      savedViewName={savedView.data?.name ?? null}
      onPeriodChange={changePeriod}
      onSupplierIdsChange={changeSupplierIds}
      onSelectedSuppliersChange={setSelectedSuppliers}
      onReset={resetScope}
      resetDisabled={resetDisabled}
    />

    {analytics.isPending ? <LoadingState /> : analytics.isError || !analytics.data ? <ErrorState onRetry={() => void analytics.refetch()} /> : <>
      {analytics.data.scopeCount > 1 ? <div className="border-warning/40 bg-warning/10 text-warning-foreground flex items-start gap-3 rounded-xl border p-4 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><p>{t('items.analytics.multipleScopesNotice')}</p></div> : null}
      <ItemPriceSummaryCards analytics={analytics.data} />
    </>}

    <div className="sticky top-3 z-20 flex flex-wrap gap-1.5 rounded-xl border bg-background/95 p-2 shadow-sm backdrop-blur">
      <Button variant="ghost" size="sm" onClick={() => document.getElementById('supplier-comparison')?.scrollIntoView({ behavior: 'smooth' })}>{t('items.analytics.supplierComparison')}</Button>
      <Button variant="ghost" size="sm" onClick={() => document.getElementById('price-history')?.scrollIntoView({ behavior: 'smooth' })}>{t('items.analytics.priceHistory')}</Button>
      <Button variant="ghost" size="sm" onClick={() => document.getElementById('my-quotes')?.scrollIntoView({ behavior: 'smooth' })}>{t('priceQuotes.myQuotes')}</Button>
      <Button variant="ghost" size="sm" onClick={() => document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth' })}>{t('items.analytics.transactions')}</Button>
      <Button variant="ghost" size="sm" onClick={() => document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth' })}>{t('items.activity')}</Button>
    </div>

    <section id="supplier-comparison" className="scroll-mt-24">
      {supplierComparison.isPending ? <LoadingState /> : supplierComparison.isError || !supplierComparison.data ? <ErrorState onRetry={() => void supplierComparison.refetch()} /> : <ItemSupplierComparisonTable
        data={supplierComparison.data}
        selectedSupplierCount={supplierIds.length}
        page={supplierPage}
        pageSize={supplierIds.length >= 2 && supplierIds.length <= 5 ? Math.max(5, supplierIds.length) : supplierPageSize}
        sortColumn={supplierSort.sortColumn}
        sortDirection={supplierSort.sortDirection}
        onSort={(column) => { supplierSort.handleSort(column); setSupplierPage(1) }}
        onPageChange={setSupplierPage}
        onPageSizeChange={(value) => { setSupplierPageSize(value); setSupplierPage(1) }}
      />}
    </section>

    <section id="price-history" className="scroll-mt-24">
      {history.isPending ? <LoadingState /> : history.isError || !history.data ? <ErrorState onRetry={() => void history.refetch()} /> : <ItemPriceHistoryChart history={history.data} />}
    </section>

    <section id="my-quotes" className="scroll-mt-24">
      <PriceQuoteScopePanel
        item={{ id: item.id, name: item.name, unit: item.unit }}
        supplierIds={supplierIds}
        period={period}
      />
    </section>

    <section id="transactions" className="scroll-mt-24">
      {transactions.isPending ? <LoadingState /> : transactions.isError || !transactions.data ? <ErrorState onRetry={() => void transactions.refetch()} /> : <ItemTransactionsTable
        data={transactions.data}
        page={transactionPage}
        pageSize={transactionPageSize}
        sortColumn={transactionSort.sortColumn}
        sortDirection={transactionSort.sortDirection}
        onSort={(column) => { transactionSort.handleSort(column); setTransactionPage(1) }}
        onPageChange={setTransactionPage}
        onPageSizeChange={(value) => { setTransactionPageSize(value); setTransactionPage(1) }}
      />}
    </section>

    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/15 pb-4">
        <CardTitle className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-lg">
            <Info className="size-4" />
          </span>
          {t('items.information')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-6">
        <InformationTile label={t('items.code')} className="lg:col-span-2">
          <InformationValue value={item.code} dir="ltr" mono numeric />
        </InformationTile>

        <InformationTile label={t('items.source')} className="lg:col-span-2">
          <ItemSourceBadge source={item.source} />
        </InformationTile>

        <InformationTile label={t('items.category')} className="lg:col-span-2">
          <InformationValue value={item.categoryName} />
        </InformationTile>

        <InformationTile label={t('items.parentName')} className="sm:col-span-2 lg:col-span-4">
          <InformationValue value={item.parentName} />
        </InformationTile>

        <InformationTile label={t('items.unit')} className="lg:col-span-2">
          <InformationValue value={item.unit} />
        </InformationTile>

        <InformationTile label={t('items.pieceUnit')} className="lg:col-span-2">
          <InformationValue value={item.pieceUnit} />
        </InformationTile>

        <InformationTile label={t('items.factor')} className="lg:col-span-2">
          <InformationValue
            value={item.factor === null ? null : String(item.factor)}
            dir="ltr"
            numeric
          />
        </InformationTile>

        <InformationTile label={t('items.statusCode')} className="lg:col-span-2">
          <InformationValue
            value={item.statusCode === null ? null : String(item.statusCode)}
            dir="ltr"
            numeric
          />
        </InformationTile>

        <InformationTile label={t('items.stockItem')} className="lg:col-span-3">
          <BooleanValue
            value={item.isStockItem}
            yesLabel={t('common.yes')}
            noLabel={t('common.no')}
          />
        </InformationTile>

        <InformationTile label={t('items.asset')} className="lg:col-span-3">
          <BooleanValue
            value={item.isAsset}
            yesLabel={t('common.yes')}
            noLabel={t('common.no')}
          />
        </InformationTile>
      </CardContent>
    </Card>

    <Card id="activity" className="scroll-mt-24"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />{t('items.activity')}</CardTitle></CardHeader><CardContent>{activity.isPending ? <LoadingState className="border-0 p-4" /> : activity.isError ? <ErrorState className="border-0" onRetry={() => void activity.refetch()} /> : (activity.data?.length ?? 0) === 0 ? <p className="text-muted-foreground text-sm">{t('items.noActivity')}</p> : <div className="space-y-3">{activity.data?.map((entry) => <div key={entry.id} className="bg-muted/35 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{t(`items.activityTypes.${entry.type}`)}</p><time className="text-muted-foreground text-xs">{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAtUtc))}</time></div><p className="text-muted-foreground mt-1 text-xs">{entry.actorName}</p>{entry.changes ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(entry.changes).map(([field, change]) => <div key={field} className="rounded-lg border bg-background p-2.5 text-xs"><p className="font-medium">{t(`items.fields.${field}`, { defaultValue: field })}</p><p className="text-muted-foreground mt-1 break-words">{String(change.from ?? '—')} → {String(change.to ?? '—')}</p></div>)}</div> : null}</div>)}</div>}</CardContent></Card>
    <ItemEditorDialog open={editOpen} item={item} onOpenChange={setEditOpen} />
  </div>
}

function sameNumberSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

function InformationTile({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border bg-muted/20 px-4 py-3.5 ${className ?? ''}`}>
      <p className="text-muted-foreground text-start text-xs font-medium">{label}</p>
      <div className="mt-2 min-h-6 text-start">{children}</div>
    </div>
  )
}

function InformationValue({
  value,
  dir = 'auto',
  mono = false,
  numeric = false,
}: {
  value: string | null
  dir?: 'auto' | 'ltr' | 'rtl'
  mono?: boolean
  numeric?: boolean
}) {
  return (
    <span
      dir={dir}
      className={`inline-block max-w-full break-words text-sm font-semibold ${
        mono ? 'font-mono' : ''
      } ${numeric ? 'tabular-nums' : ''}`}
    >
      {value || '—'}
    </span>
  )
}

function BooleanValue({
  value,
  yesLabel,
  noLabel,
}: {
  value: boolean
  yesLabel: string
  noLabel: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${
        value
          ? 'bg-success/10 text-success'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {value ? <Check aria-hidden="true" className="size-3.5" /> : <Minus aria-hidden="true" className="size-3.5" />}
      {value ? yesLabel : noLabel}
    </span>
  )
}

