import { ArrowDown, ArrowUp, Columns3, List, Minus, PackageSearch, Plus, SearchX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { OverflowTooltipText } from '@/components/shared/OverflowTooltipText'
import { PageHeader } from '@/components/shared/PageHeader'
import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemEditorDialog } from '@/features/items/components/ItemEditorDialog'
import { ItemPriceFilters } from '@/features/items/components/ItemPriceFilters'
import { formatDateOnly, formatPercent, formatUnitCost } from '@/features/items/components/item-price-format'
import { ItemsOverviewCards } from '@/features/items/components/ItemsOverviewCards'
import { SavedViewSupplierComparisonTable } from '@/features/items/components/SavedViewSupplierComparisonTable'
import { useItemPriceSummaries, useItemSupplierMatrix, useItems, useItemsOverview } from '@/features/items/hooks/use-items'
import type { ItemSortBy, ItemSource, ProcurementPricePeriod } from '@/features/items/types/item.types'
import { ProcurementSavedViewsBar } from '@/features/procurement-saved-views/components/ProcurementSavedViewsBar'
import { useProcurementSavedView, useProcurementSavedViews } from '@/features/procurement-saved-views/hooks/use-procurement-saved-views'
import { usePriceQuoteSummary } from '@/features/price-quotes/hooks/use-price-quotes'
import { useSortState } from '@/hooks/use-sort-state'

const ANALYTICS_SORTS = new Set<ItemSortBy>(['latest', 'lowest', 'highest', 'change', 'suppliers', 'lastPurchase'])
const MAX_MATRIX_SUPPLIERS = 5

type SavedViewDisplayMode = 'summary' | 'supplierComparison'

function savedViewDisplayModeKey(viewId: number): string {
  return `taskhub.procurement.saved-view.${viewId}.display-mode`
}

export function ItemsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [urlParams, setUrlParams] = useSearchParams()
  const initialView = Number(urlParams.get('view'))
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<ItemSource | 'ALL'>('ALL')
  const [status, setStatus] = useState<'ALL' | '1' | '0'>('ALL')
  const [period, setPeriod] = useState<ProcurementPricePeriod>('1Y')
  const [supplierIds, setSupplierIds] = useState<number[]>([])
  const [selectedSuppliers, setSelectedSuppliers] = useState<SearchableSelectOption[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [createOpen, setCreateOpen] = useState(false)
  const [activeViewId, setActiveViewId] = useState<number | null>(Number.isSafeInteger(initialView) && initialView > 0 ? initialView : null)
  const [displayMode, setDisplayMode] = useState<SavedViewDisplayMode>('summary')
  const [matrixSupplierIds, setMatrixSupplierIds] = useState<number[]>([])
  const [viewSortOverride, setViewSortOverride] = useState<{ column: ItemSortBy; direction: 'asc' | 'desc' } | null>(null)
  const savedViews = useProcurementSavedViews()
  const activeViewDetail = useProcurementSavedView(activeViewId)
  const initializedDefault = useRef(false)
  const sort = useSortState<ItemSortBy>('name', 'asc')

  useEffect(() => {
    if (activeViewId !== null || initializedDefault.current || !savedViews.data) return
    initializedDefault.current = true
    const defaultView = savedViews.data.find((view) => view.isDefault)
    if (!defaultView) return
    setActiveViewId(defaultView.id)
    setViewSortOverride(null)
    setPage(1)
    setSearch('')
    setUrlParams({ view: String(defaultView.id) }, { replace: true })
  }, [activeViewId, savedViews.data, setUrlParams])

  useEffect(() => {
    if (activeViewId === null) {
      setDisplayMode('summary')
      return
    }
    try {
      const stored = window.localStorage.getItem(savedViewDisplayModeKey(activeViewId))
      setDisplayMode(stored === 'supplierComparison' ? 'supplierComparison' : 'summary')
    } catch {
      setDisplayMode('summary')
    }
  }, [activeViewId])

  useEffect(() => {
    if (!activeViewDetail.data) return
    const view = activeViewDetail.data
    setPeriod(view.config.period)
    setSource(view.config.source ?? 'ALL')
    setStatus(view.config.statusCode === null ? 'ALL' : String(view.config.statusCode) as '1' | '0')
    setSupplierIds(view.config.supplierIds)
    setSelectedSuppliers(view.selectedSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: supplier.code })))
  }, [activeViewDetail.data])

  useEffect(() => {
    setMatrixSupplierIds(supplierIds.slice(0, MAX_MATRIX_SUPPLIERS))
  }, [activeViewId, supplierIds])

  const activeView = savedViews.data?.find((view) => view.id === activeViewId) ?? null
  const configuredSort = activeView?.config.sortBy
  const allowedSorts: ItemSortBy[] = ['code', 'name', 'category', 'unit', 'status', 'source', 'latest', 'lowest', 'highest', 'change', 'suppliers', 'lastPurchase']
  const savedViewSort = configuredSort && allowedSorts.includes(configuredSort as ItemSortBy) ? configuredSort as ItemSortBy : 'name'
  const sortBy = activeView ? (viewSortOverride?.column ?? savedViewSort) : (sort.sortColumn ?? 'name')
  const sortDirection = activeView ? (viewSortOverride?.direction ?? activeView.config.sortDirection) : sort.sortDirection
  const displayedSortColumn = activeView ? (viewSortOverride?.column ?? savedViewSort) : sort.sortColumn

  const queryFilters = useMemo(() => ({
    search,
    ...(activeView?.config.itemIds.length ? { itemIds: activeView.config.itemIds } : {}),
    ...(activeView ? (activeView.config.source ? { source: activeView.config.source } : {}) : source === 'ALL' ? {} : { source }),
    ...(activeView?.config.category ? { category: activeView.config.category } : {}),
    ...(activeView ? (activeView.config.statusCode !== null ? { statusCode: activeView.config.statusCode } : {}) : status === 'ALL' ? {} : { statusCode: Number(status) }),
    period,
    ...(supplierIds.length ? { supplierIds } : {}),
  }), [activeView, period, search, source, status, supplierIds])

  const itemMasterFilters = useMemo(() => ({
    search: queryFilters.search,
    ...(queryFilters.itemIds?.length ? { itemIds: queryFilters.itemIds } : {}),
    ...(queryFilters.source ? { source: queryFilters.source } : {}),
    ...(queryFilters.category ? { category: queryFilters.category } : {}),
    ...(queryFilters.statusCode !== undefined ? { statusCode: queryFilters.statusCode } : {}),
  }), [queryFilters])

  const pendingDefaultViewSelection =
    activeViewId === null &&
    !initializedDefault.current &&
    Boolean(savedViews.data?.some((view) => view.isDefault))
  const savedViewContextReady =
    !savedViews.isPending &&
    !pendingDefaultViewSelection &&
    (activeViewId === null || !activeViewDetail.isPending)

  const usesAnalyticsSort = ANALYTICS_SORTS.has(sortBy)
  const items = useItems(
    {
      ...(usesAnalyticsSort ? queryFilters : itemMasterFilters),
      page,
      pageSize,
      sortBy,
      sortDirection,
    },
    savedViewContextReady,
  )
  const visibleItemIds = useMemo(() => items.data?.items.map((item) => item.id) ?? [], [items.data])
  const priceSummaries = useItemPriceSummaries(
    {
      itemIds: visibleItemIds,
      period,
      ...(supplierIds.length ? { supplierIds } : {}),
    },
    savedViewContextReady
      && displayMode === 'summary'
      && items.isSuccess
      && !items.isFetching
      && !usesAnalyticsSort
      && visibleItemIds.length > 0,
  )
  const supplierMatrix = useItemSupplierMatrix(
    { itemIds: visibleItemIds, supplierIds: matrixSupplierIds, period },
    savedViewContextReady
      && displayMode === 'supplierComparison'
      && Boolean(activeView)
      && items.isSuccess
      && !items.isFetching
      && visibleItemIds.length > 0
      && matrixSupplierIds.length > 0,
  )
  const priceByItemId = useMemo(
    () => new Map((priceSummaries.data?.items ?? []).map((entry) => [entry.itemId, entry.price])),
    [priceSummaries.data],
  )
  const data = useMemo(() => {
    if (!items.data || usesAnalyticsSort) return items.data
    return {
      ...items.data,
      items: items.data.items.map((item) => ({ ...item, price: priceByItemId.get(item.id) ?? null })),
    }
  }, [items.data, priceByItemId, usesAnalyticsSort])
  const visiblePricesLoading =
    displayMode === 'summary'
    && !usesAnalyticsSort
    && visibleItemIds.length > 0
    && (priceSummaries.isPending || priceSummaries.isFetching)
  const visiblePricesUnavailable = displayMode === 'summary' && !usesAnalyticsSort && priceSummaries.isError
  const primaryPriceIntelligenceSettled = displayMode === 'supplierComparison'
    ? matrixSupplierIds.length === 0 || supplierMatrix.isSuccess || supplierMatrix.isError
    : usesAnalyticsSort || visibleItemIds.length === 0 || priceSummaries.isSuccess || priceSummaries.isError
  const secondaryAnalyticsEnabled =
    savedViewContextReady && items.isSuccess && !items.isFetching && primaryPriceIntelligenceSettled
  const overview = useItemsOverview(queryFilters, secondaryAnalyticsEnabled)
  const quoteSummary = usePriceQuoteSummary({
    itemIds: activeView?.config.itemIds ?? [],
    supplierIds,
    period,
  }, secondaryAnalyticsEnabled)
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const startRow = data?.total ? (page - 1) * pageSize + 1 : 0
  const endRow = Math.min(page * pageSize, data?.total ?? 0)

  function changeDisplayMode(mode: SavedViewDisplayMode) {
    if (!activeViewId) return
    setDisplayMode(mode)
    try {
      window.localStorage.setItem(savedViewDisplayModeKey(activeViewId), mode)
    } catch {
      // Local persistence is best-effort; the Saved View data itself is unchanged.
    }
  }

  function changeView(id: number | null) {
    setActiveViewId(id)
    setViewSortOverride(null)
    setPage(1)
    setSearch('')
    if (id === null) {
      setPeriod('1Y')
      setSource('ALL')
      setStatus('ALL')
      setSupplierIds([])
      setSelectedSuppliers([])
      setUrlParams({}, { replace: true })
    } else {
      setUrlParams({ view: String(id) }, { replace: true })
    }
  }

  function onSort(column: ItemSortBy) {
    if (activeView) {
      const currentColumn = viewSortOverride?.column ?? savedViewSort
      const currentDirection = viewSortOverride?.direction ?? activeView.config.sortDirection
      setViewSortOverride({ column, direction: currentColumn === column && currentDirection === 'asc' ? 'desc' : 'asc' })
    } else sort.handleSort(column)
    setPage(1)
  }

  function resetPriceScope() {
    if (activeViewDetail.data) {
      setPeriod(activeViewDetail.data.config.period)
      setSupplierIds(activeViewDetail.data.config.supplierIds)
      setSelectedSuppliers(activeViewDetail.data.selectedSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: supplier.code })))
    } else {
      setPeriod('1Y')
      setSupplierIds([])
      setSelectedSuppliers([])
    }
    setPage(1)
  }

  return <div className="space-y-6">
    <PageHeader eyebrow={t('procurement.title')} title={t('items.pageTitle')} description={t('items.pageDescription')} actions={<Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />{t('items.create')}</Button>} />

    <Card className="p-4"><ProcurementSavedViewsBar activeId={activeViewId} onActiveChange={changeView} /></Card>

    {overview.data ? <ItemsOverviewCards overview={overview.data} quoteSummary={quoteSummary.data} /> : null}

    <ItemPriceFilters
      period={period}
      supplierIds={supplierIds}
      selectedSuppliers={selectedSuppliers}
      savedViewName={activeView?.name ?? null}
      onPeriodChange={(value) => { setPeriod(value); setPage(1) }}
      onSupplierIdsChange={(ids) => { setSupplierIds(ids); setPage(1) }}
      onSelectedSuppliersChange={setSelectedSuppliers}
      onReset={resetPriceScope}
    />

    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} className="w-full xl:max-w-md" placeholder={t('items.searchPlaceholder')} ariaLabel={t('items.searchLabel')} />
          {activeView ? <div className="flex shrink-0 rounded-lg border bg-muted/20 p-1">
            <Button type="button" size="sm" variant={displayMode === 'summary' ? 'default' : 'ghost'} onClick={() => changeDisplayMode('summary')}><List className="size-4" />{t('items.matrix.summaryMode')}</Button>
            <Button type="button" size="sm" variant={displayMode === 'supplierComparison' ? 'default' : 'ghost'} disabled={supplierIds.length === 0} onClick={() => changeDisplayMode('supplierComparison')}><Columns3 className="size-4" />{t('items.matrix.comparisonMode')}</Button>
          </div> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select disabled={Boolean(activeView)} value={source} onValueChange={(value) => { setSource(value as ItemSource | 'ALL'); setPage(1) }}><SelectTrigger className="w-full sm:w-48" aria-label={t('items.source')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('items.sourceAll')}</SelectItem><SelectItem value="ORACLE">{t('items.sourceOracle')}</SelectItem><SelectItem value="MANUAL">{t('items.sourceManual')}</SelectItem></SelectContent></Select>
          <Select disabled={Boolean(activeView)} value={status} onValueChange={(value) => { setStatus(value as 'ALL' | '1' | '0'); setPage(1) }}><SelectTrigger className="w-full sm:w-44" aria-label={t('items.statusCode')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('items.statusAll')}</SelectItem><SelectItem value="1">{t('items.statusActive')}</SelectItem><SelectItem value="0">{t('items.statusInactive')}</SelectItem></SelectContent></Select>
        </div>
      </div>

      {visiblePricesLoading ? <div className="text-muted-foreground flex items-center gap-2 border-b bg-muted/20 px-4 py-2 text-xs"><span className="bg-primary size-1.5 animate-pulse rounded-full" />{t('items.analytics.visiblePricesLoading')}</div> : null}
      {visiblePricesUnavailable ? <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/25 px-4 py-2 text-xs"><span className="text-muted-foreground">{t('items.analytics.visiblePricesUnavailable')}</span><Button type="button" size="sm" variant="ghost" onClick={() => void priceSummaries.refetch()}>{t('common.retry')}</Button></div> : null}

      {items.isPending ? <LoadingState className="rounded-none border-0" /> : items.isError || !data ? <ErrorState className="rounded-none border-0" onRetry={() => void items.refetch()} /> : data.items.length === 0 ? <EmptyState className="rounded-none border-0" icon={SearchX} title={t('items.emptyTitle')} description={t('items.emptyDescription')} /> : <>
        {displayMode === 'supplierComparison' && activeView ? (
          <SavedViewSupplierComparisonTable
            savedViewId={activeView.id}
            savedViewName={activeView.name}
            items={data.items}
            suppliers={selectedSuppliers}
            period={period}
            matrixData={supplierMatrix.data}
            matrixLoading={supplierMatrix.isPending || supplierMatrix.isFetching}
            matrixError={supplierMatrix.isError}
            visibleSupplierIds={matrixSupplierIds}
            onVisibleSupplierIdsChange={setMatrixSupplierIds}
            onRetryMatrix={() => void supplierMatrix.refetch()}
          />
        ) : <>
          <div className="hidden max-h-[68vh] overflow-auto md:block"><table className="min-w-[64rem] w-full text-sm"><thead className="sticky top-0 z-10"><tr>
            <SortableHeader label={t('items.name')} column="name" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
            <SortableHeader label={t('items.analytics.latest')} column="latest" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
            <SortableHeader label={t('items.analytics.lowest')} column="lowest" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
            <SortableHeader label={t('items.analytics.highest')} column="highest" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
            <SortableHeader label={t('items.analytics.latestChange')} column="change" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
            <SortableHeader label={t('items.analytics.suppliers')} column="suppliers" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
            <SortableHeader label={t('items.analytics.lastPurchase')} column="lastPurchase" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
          </tr></thead><tbody>{data.items.map((item) => {
            const detailsPath = activeViewId ? `/items/${item.id}?view=${activeViewId}` : `/items/${item.id}`
            return <tr key={item.id} className="hover:bg-primary/[0.035] border-b last:border-b-0">
              <td className="px-4 py-4"><Link to={detailsPath} className="group hover:text-primary focus-visible:ring-ring inline-flex max-w-full items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-2"><PackageSearch className="text-primary size-4 shrink-0" /><OverflowTooltipText className="max-w-[24rem]">{item.name}</OverflowTooltipText></Link><div className="text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-xs"><span dir="ltr" className="font-mono">{item.code}</span>{item.categoryName ? <span>· {item.categoryName}</span> : null}</div></td>
              <td className="px-4 py-4">{visiblePricesLoading ? <PriceCellSkeleton wide /> : <><p dir="ltr" className="font-semibold tabular-nums">{formatUnitCost(item.price?.latestUnitCost ?? null, locale, item.price?.currencyCode, item.price?.unitName)}</p>{item.price ? <p className="text-muted-foreground mt-1 max-w-[14rem] truncate text-xs">{item.price.latestSupplierName}</p> : null}</>}</td>
              <td dir="ltr" className="px-4 py-4 tabular-nums">{visiblePricesLoading ? <PriceCellSkeleton /> : formatUnitCost(item.price?.lowestUnitCost ?? null, locale, item.price?.currencyCode, item.price?.unitName)}</td>
              <td dir="ltr" className="px-4 py-4 tabular-nums">{visiblePricesLoading ? <PriceCellSkeleton /> : formatUnitCost(item.price?.highestUnitCost ?? null, locale, item.price?.currencyCode, item.price?.unitName)}</td>
              <td className="px-4 py-4">{visiblePricesLoading ? <PriceCellSkeleton compact /> : item.price?.changePercent === null || item.price?.changePercent === undefined ? '—' : <span dir="ltr" className={`inline-flex items-center gap-1 font-semibold ${item.price.changePercent > 0 ? 'text-destructive' : item.price.changePercent < 0 ? 'text-success' : 'text-muted-foreground'}`}>{item.price.changePercent > 0 ? <ArrowUp className="size-3.5" /> : item.price.changePercent < 0 ? <ArrowDown className="size-3.5" /> : <Minus className="size-3.5" />}{formatPercent(item.price.changePercent, locale)}</span>}</td>
              <td className="px-4 py-4 tabular-nums">{visiblePricesLoading ? <PriceCellSkeleton compact /> : visiblePricesUnavailable ? '—' : (item.price?.supplierCount ?? 0)}</td>
              <td className="px-4 py-4">{visiblePricesLoading ? <PriceCellSkeleton /> : formatDateOnly(item.price?.lastPurchaseDate ?? null, locale)}</td>
            </tr>
          })}</tbody></table></div>
          <div className="divide-y md:hidden">{data.items.map((item) => {
            const detailsPath = activeViewId ? `/items/${item.id}?view=${activeViewId}` : `/items/${item.id}`
            return <Link key={item.id} to={detailsPath} className="hover:bg-primary/[0.035] block p-4"><div className="flex gap-3"><span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg"><PackageSearch className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p dir="ltr" className="text-muted-foreground mt-1 font-mono text-xs">{item.code}</p><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">{t('items.analytics.latest')}</p><p dir="ltr" className="mt-1 font-semibold">{visiblePricesLoading ? <PriceCellSkeleton /> : formatUnitCost(item.price?.latestUnitCost ?? null, locale, item.price?.currencyCode, item.price?.unitName)}</p></div><div><p className="text-muted-foreground">{t('items.analytics.latestChange')}</p><p dir="ltr" className="mt-1 font-semibold">{visiblePricesLoading ? <PriceCellSkeleton compact /> : formatPercent(item.price?.changePercent ?? null, locale)}</p></div><div><p className="text-muted-foreground">{t('items.analytics.suppliers')}</p><p className="mt-1 font-semibold">{visiblePricesLoading ? <PriceCellSkeleton compact /> : visiblePricesUnavailable ? '—' : (item.price?.supplierCount ?? 0)}</p></div><div><p className="text-muted-foreground">{t('items.analytics.lastPurchase')}</p><p className="mt-1 font-semibold">{visiblePricesLoading ? <PriceCellSkeleton /> : formatDateOnly(item.price?.lastPurchaseDate ?? null, locale)}</p></div></div></div></div></Link>
          })}</div>
        </>}
        <TablePagination page={page} totalPages={totalPages} pageSize={pageSize} startRow={startRow} endRow={endRow} totalRows={data.total} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} />
      </>}
    </Card>
    <ItemEditorDialog open={createOpen} onOpenChange={setCreateOpen} />
  </div>
}

function PriceCellSkeleton({ wide = false, compact = false }: { wide?: boolean; compact?: boolean }) {
  const width = compact ? 'w-10' : wide ? 'w-28' : 'w-20'
  return <span aria-hidden="true" className={`bg-muted inline-block h-4 ${width} animate-pulse rounded`} />
}

