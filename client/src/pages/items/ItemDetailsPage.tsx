import { Activity, Info, Pencil, PackageSearch, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
  const [searchParams] = useSearchParams()
  const rawId = Number(params.itemId)
  const itemId = Number.isSafeInteger(rawId) && rawId !== 0 ? rawId : null
  const rawViewId = Number(searchParams.get('view'))
  const savedViewId = Number.isSafeInteger(rawViewId) && rawViewId > 0 ? rawViewId : null
  const rawSupplierId = Number(searchParams.get('supplier'))
  const routeSupplierId = Number.isSafeInteger(rawSupplierId) && rawSupplierId !== 0 ? rawSupplierId : null
  const routePeriod = searchParams.get('period')
  const initialPeriod: ProcurementPricePeriod =
    routePeriod === '1M' || routePeriod === '3M' || routePeriod === '6M' || routePeriod === '1Y' || routePeriod === 'ALL'
      ? routePeriod
      : '1Y'
  const savedView = useProcurementSavedView(savedViewId)
  const routeSupplier = useSupplier(savedViewId ? null : routeSupplierId)
  const itemQuery = useItem(itemId)
  const activity = useItemActivity(itemId)
  const [editOpen, setEditOpen] = useState(false)
  const [period, setPeriod] = useState<ProcurementPricePeriod>(initialPeriod)
  const [supplierIds, setSupplierIds] = useState<number[]>(routeSupplierId === null ? [] : [routeSupplierId])
  const [selectedSuppliers, setSelectedSuppliers] = useState<SearchableSelectOption[]>([])
  const [supplierPage, setSupplierPage] = useState(1)
  const [supplierPageSize, setSupplierPageSize] = useState(10)
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactionPageSize, setTransactionPageSize] = useState(25)
  const supplierSort = useSortState<ItemSupplierSortBy>('latest', 'asc')
  const transactionSort = useSortState<ItemTransactionSortBy>('transactionDate', 'desc')

  useEffect(() => {
    if (!savedViewId && routeSupplierId !== null) {
      setPeriod(initialPeriod)
      setSupplierIds([routeSupplierId])
      setSelectedSuppliers(
        routeSupplier.data
          ? [{ value: routeSupplier.data.id, label: routeSupplier.data.name, description: routeSupplier.data.code }]
          : [],
      )
      setSupplierPage(1)
      setTransactionPage(1)
    }
  }, [initialPeriod, routeSupplier.data, routeSupplierId, savedViewId])

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

  function resetScope() {
    if (savedView.data) {
      setPeriod(savedView.data.config.period)
      setSupplierIds(savedView.data.config.supplierIds)
      setSelectedSuppliers(savedView.data.selectedSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: supplier.code })))
    } else if (routeSupplierId !== null) {
      setPeriod(initialPeriod)
      setSupplierIds([routeSupplierId])
      setSelectedSuppliers(
        routeSupplier.data
          ? [{ value: routeSupplier.data.id, label: routeSupplier.data.name, description: routeSupplier.data.code }]
          : [],
      )
    } else {
      setPeriod('1Y')
      setSupplierIds([])
      setSelectedSuppliers([])
    }
    setSupplierPage(1)
    setTransactionPage(1)
  }

  function changePeriod(value: ProcurementPricePeriod) {
    setPeriod(value)
    setSupplierPage(1)
    setTransactionPage(1)
  }

  function changeSupplierIds(ids: number[]) {
    setSupplierIds(ids)
    setSupplierPage(1)
    setTransactionPage(1)
  }

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

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Info className="size-4" />{t('items.information')}</CardTitle></CardHeader><CardContent className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      <InfoField label={t('items.code')} value={item.code} dir="ltr" /><div><p className="text-muted-foreground text-xs font-medium">{t('items.source')}</p><div className="mt-1"><ItemSourceBadge source={item.source} /></div></div><InfoField label={t('items.category')} value={item.categoryName} /><InfoField label={t('items.parentName')} value={item.parentName} /><InfoField label={t('items.unit')} value={item.unit} /><InfoField label={t('items.pieceUnit')} value={item.pieceUnit} /><InfoField label={t('items.factor')} value={item.factor === null ? null : String(item.factor)} dir="ltr" /><InfoField label={t('items.statusCode')} value={item.statusCode === null ? null : String(item.statusCode)} dir="ltr" /><InfoField label={t('items.stockItem')} value={t(item.isStockItem ? 'common.yes' : 'common.no')} /><InfoField label={t('items.asset')} value={t(item.isAsset ? 'common.yes' : 'common.no')} />
    </CardContent></Card>

    <Card id="activity" className="scroll-mt-24"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />{t('items.activity')}</CardTitle></CardHeader><CardContent>{activity.isPending ? <LoadingState className="border-0 p-4" /> : activity.isError ? <ErrorState className="border-0" onRetry={() => void activity.refetch()} /> : (activity.data?.length ?? 0) === 0 ? <p className="text-muted-foreground text-sm">{t('items.noActivity')}</p> : <div className="space-y-3">{activity.data?.map((entry) => <div key={entry.id} className="bg-muted/35 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{t(`items.activityTypes.${entry.type}`)}</p><time className="text-muted-foreground text-xs">{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAtUtc))}</time></div><p className="text-muted-foreground mt-1 text-xs">{entry.actorName}</p>{entry.changes ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(entry.changes).map(([field, change]) => <div key={field} className="rounded-lg border bg-background p-2.5 text-xs"><p className="font-medium">{t(`items.fields.${field}`, { defaultValue: field })}</p><p className="text-muted-foreground mt-1 break-words">{String(change.from ?? '—')} → {String(change.to ?? '—')}</p></div>)}</div> : null}</div>)}</div>}</CardContent></Card>
    <ItemEditorDialog open={editOpen} item={item} onOpenChange={setEditOpen} />
  </div>
}

function InfoField({ label, value, dir }: { label: string; value: string | null; dir?: 'ltr' | 'rtl' }) {
  return <div><p className="text-muted-foreground text-xs font-medium">{label}</p><p dir={dir} className="mt-1 break-words text-sm font-medium">{value || '—'}</p></div>
}

