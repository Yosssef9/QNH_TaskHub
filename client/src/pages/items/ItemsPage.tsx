import { ArrowDown, ArrowUp, Building2, Columns3, FileUp, List, Minus, PackageSearch, Plus, SearchX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { TablePagination } from '@/components/shared/TablePagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemEditorDialog } from '@/features/items/components/ItemEditorDialog'
import { ProcurementImportDialog } from '@/features/procurement-imports/components/ProcurementImportDialog'
import { ItemPriceFilters } from '@/features/items/components/ItemPriceFilters'
import { formatDateOnly, formatPercent, formatUnitCost } from '@/features/items/components/item-price-format'
import { ItemsOverviewCards } from '@/features/items/components/ItemsOverviewCards'
import { SavedViewSupplierComparisonTable } from '@/features/items/components/SavedViewSupplierComparisonTable'
import { useItemPriceSummaries, useItemSupplierMatrix, useItems, useItemsOverview } from '@/features/items/hooks/use-items'
import type { ItemSortBy, ItemSource, ItemSupplierMatrixMetric, ItemSupplierMatrixPriceSource, ProcurementPricePeriod } from '@/features/items/types/item.types'
import { ProcurementSavedViewsBar } from '@/features/procurement-saved-views/components/ProcurementSavedViewsBar'
import { useProcurementSavedView, useProcurementSavedViews, useUpdateProcurementSavedView } from '@/features/procurement-saved-views/hooks/use-procurement-saved-views'
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
  const [importOpen, setImportOpen] = useState(false)
  const [activeViewId, setActiveViewId] = useState<number | null>(Number.isSafeInteger(initialView) && initialView > 0 ? initialView : null)
  const [displayMode, setDisplayMode] = useState<SavedViewDisplayMode>('summary')
  const [matrixSupplierIds, setMatrixSupplierIds] = useState<number[]>([])
  const [matrixPriceSourceOverride, setMatrixPriceSourceOverride] = useState<ItemSupplierMatrixPriceSource | null>(null)
  const [matrixMetricOverride, setMatrixMetricOverride] = useState<ItemSupplierMatrixMetric | null>(null)
  const [viewSortOverride, setViewSortOverride] = useState<{ column: ItemSortBy; direction: 'asc' | 'desc' } | null>(null)
  const savedViews = useProcurementSavedViews()
  const updateSavedView = useUpdateProcurementSavedView()
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
    setMatrixPriceSourceOverride(null)
    setMatrixMetricOverride(null)
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
  const matrixConfig = activeViewDetail.data?.config ?? activeView?.config
  const matrixPriceSource = matrixPriceSourceOverride ?? matrixConfig?.matrixPriceSource ?? 'actual'
  const matrixMetric = matrixMetricOverride ?? matrixConfig?.matrixMetric ?? 'latest'
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

  async function persistMatrixSettings(
    next: Partial<{ matrixPriceSource: ItemSupplierMatrixPriceSource; matrixMetric: ItemSupplierMatrixMetric }>,
  ) {
    const view = activeViewDetail.data
    if (!view || updateSavedView.isPending) return

    if (next.matrixPriceSource) setMatrixPriceSourceOverride(next.matrixPriceSource)
    if (next.matrixMetric) setMatrixMetricOverride(next.matrixMetric)

    try {
      await updateSavedView.mutateAsync({
        id: view.id,
        input: {
          name: view.name,
          config: { ...view.config, ...next },
          isDefault: view.isDefault,
          rowVersion: view.rowVersion,
        },
      })
    } catch {
      if (next.matrixPriceSource) setMatrixPriceSourceOverride(null)
      if (next.matrixMetric) setMatrixMetricOverride(null)
      toast.error(t('savedViews.errors.save'))
    }
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
    <PageHeader
      eyebrow={t('procurement.title')}
      title={t('items.pageTitle')}
      description={t('items.pageDescription')}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="size-4" />
            {t('items.importExcel.button')}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('items.create')}
          </Button>
        </div>
      }
    />

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
            priceSource={matrixPriceSource}
            metric={matrixMetric}
            settingsSaving={updateSavedView.isPending}
            onVisibleSupplierIdsChange={setMatrixSupplierIds}
            onPriceSourceChange={(value) => { void persistMatrixSettings({ matrixPriceSource: value }) }}
            onMetricChange={(value) => { void persistMatrixSettings({ matrixMetric: value }) }}
            onRetryMatrix={() => void supplierMatrix.refetch()}
          />
        ) : <>
          <div className="hidden max-h-[68vh] overflow-auto md:block">
            <table className="w-full min-w-[92rem] table-fixed text-sm">
              <colgroup>
                <col className="w-[22rem]" />
                <col className="w-[16rem]" />
                <col className="w-[16rem]" />
                <col className="w-[16rem]" />
                <col className="w-[13rem]" />
                <col className="w-[9rem]" />
                <col className="w-[11rem]" />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-card">
                <tr>
                  <SortableHeader
                    label={t('items.name')}
                    column="name"
                    sortColumn={displayedSortColumn}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    tone="soft-primary"
                    rowSpan={2}
                    className="sticky start-0 z-30 border-e bg-accent align-middle"
                  />
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="border-primary/15 bg-accent border-b px-4 py-2.5 text-center text-[11px] font-semibold tracking-wide text-primary"
                  >
                    {t('items.analytics.priceIntelligenceGroup')}
                  </th>
                  <th
                    scope="colgroup"
                    colSpan={2}
                    className="border-primary/15 bg-accent border-b border-s px-4 py-2.5 text-center text-[11px] font-semibold tracking-wide text-primary"
                  >
                    {t('items.analytics.activityGroup')}
                  </th>
                </tr>
                <tr>
                  <SortableHeader label={t('items.analytics.latest')} column="latest" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" className="text-center" />
                  <SortableHeader label={t('items.analytics.lowest')} column="lowest" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" className="text-center" />
                  <SortableHeader label={t('items.analytics.highest')} column="highest" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" className="text-center" />
                  <SortableHeader label={t('items.analytics.latestChange')} column="change" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" className="text-center" />
                  <SortableHeader label={t('items.analytics.suppliers')} column="suppliers" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" className="border-s text-center" />
                  <SortableHeader label={t('items.analytics.lastPurchase')} column="lastPurchase" sortColumn={displayedSortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" className="text-center" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const detailsPath = activeViewId ? `/items/${item.id}?view=${activeViewId}` : `/items/${item.id}`
                  const hasPurchaseHistory = Boolean(item.price)

                  return (
                    <tr
                      key={item.id}
                      className="group border-b transition-colors even:bg-muted/10 hover:bg-primary/[0.035] last:border-b-0"
                    >
                      <td className="sticky start-0 z-10 border-e bg-card px-4 py-3.5 align-middle transition-colors group-hover:bg-accent">
                        <TableEntityLink
                          kind="item"
                          id={item.id}
                          name={item.name}
                          code={item.code}
                          to={detailsPath}
                          compact
                          className="max-w-[20rem]"
                        />
                        {item.categoryName ? (
                          <p className="text-muted-foreground mt-1.5 truncate text-start text-xs">
                            {item.categoryName}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-4 py-3.5 text-center align-middle">
                        {visiblePricesLoading ? (
                          <PriceCellSkeleton wide />
                        ) : visiblePricesUnavailable ? (
                          <span className="text-muted-foreground text-xs">{t('items.analytics.notAvailable')}</span>
                        ) : item.price ? (
                          <div className="flex flex-col items-center gap-2">
                            <span dir="ltr" className="inline-block text-base font-bold tabular-nums">
                              {formatUnitCost(item.price.latestUnitCost, locale, item.price.currencyCode, item.price.unitName)}
                            </span>
                            <TableEntityLink
                              kind="supplier"
                              id={item.price.latestSupplierId}
                              name={item.price.latestSupplierName}
                              code={item.price.latestSupplierCode}
                              compact
                              className="max-w-[13rem]"
                            />
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatDateOnly(item.price.lastPurchaseDate, locale)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground inline-flex rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium">
                            {t('items.analytics.noPurchaseHistory')}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center align-middle">
                        {visiblePricesLoading ? (
                          <PriceCellSkeleton wide />
                        ) : item.price ? (
                          <div className="flex flex-col items-center gap-2">
                            <span dir="ltr" className="inline-block font-medium tabular-nums">
                              {formatUnitCost(item.price.lowestUnitCost, locale, item.price.currencyCode, item.price.unitName)}
                            </span>
                            <TableEntityLink
                              kind="supplier"
                              id={item.price.lowestSupplierId}
                              name={item.price.lowestSupplierName}
                              code={item.price.lowestSupplierCode}
                              compact
                              className="max-w-[13rem]"
                            />
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatDateOnly(item.price.lowestTransactionDate, locale)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center align-middle">
                        {visiblePricesLoading ? (
                          <PriceCellSkeleton wide />
                        ) : item.price ? (
                          <div className="flex flex-col items-center gap-2">
                            <span dir="ltr" className="inline-block font-medium tabular-nums">
                              {formatUnitCost(item.price.highestUnitCost, locale, item.price.currencyCode, item.price.unitName)}
                            </span>
                            <TableEntityLink
                              kind="supplier"
                              id={item.price.highestSupplierId}
                              name={item.price.highestSupplierName}
                              code={item.price.highestSupplierCode}
                              compact
                              className="max-w-[13rem]"
                            />
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatDateOnly(item.price.highestTransactionDate, locale)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center align-middle">
                        {visiblePricesLoading ? (
                          <PriceCellSkeleton compact />
                        ) : visiblePricesUnavailable ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <PriceChangePill
                            value={item.price?.changePercent ?? null}
                            locale={locale}
                            hasPurchaseHistory={hasPurchaseHistory}
                            noPreviousLabel={t('items.analytics.noPreviousShort')}
                          />
                        )}
                      </td>

                      <td className="border-s px-4 py-3.5 text-center align-middle">
                        {visiblePricesLoading ? (
                          <PriceCellSkeleton compact />
                        ) : visiblePricesUnavailable || !item.price ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            aria-label={`${t('items.analytics.supplierCount')}: ${item.price.supplierCount}`}
                            className="bg-primary/8 text-primary inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
                          >
                            <Building2 aria-hidden="true" className="size-3.5" />
                            <span dir="ltr" className="tabular-nums">{item.price.supplierCount}</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center align-middle">
                        {visiblePricesLoading ? (
                          <PriceCellSkeleton />
                        ) : (
                          <span className="inline-block tabular-nums">
                            {item.price ? formatDateOnly(item.price.lastPurchaseDate, locale) : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">
            {data.items.map((item) => {
              const detailsPath = activeViewId ? `/items/${item.id}?view=${activeViewId}` : `/items/${item.id}`
              const hasPurchaseHistory = Boolean(item.price)

              return (
                <Link
                  key={item.id}
                  to={detailsPath}
                  className="hover:bg-primary/[0.035] block p-4 transition-colors"
                >
                  <div className="flex gap-3">
                    <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
                      <PackageSearch className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.name}</p>
                      <p dir="ltr" className="text-muted-foreground mt-1 font-mono text-xs">{item.code}</p>
                      {item.categoryName ? <p className="text-muted-foreground mt-1 truncate text-xs">{item.categoryName}</p> : null}

                      {!visiblePricesLoading && !visiblePricesUnavailable && !item.price ? (
                        <p className="text-muted-foreground mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium">
                          {t('items.analytics.noPurchaseHistory')}
                        </p>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">{t('items.analytics.latest')}</p>
                            <p className="mt-1 font-semibold">
                              {visiblePricesLoading ? (
                                <PriceCellSkeleton />
                              ) : visiblePricesUnavailable ? (
                                t('items.analytics.notAvailable')
                              ) : (
                                <span dir="ltr" className="inline-block tabular-nums">
                                  {formatUnitCost(item.price?.latestUnitCost ?? null, locale, item.price?.currencyCode, item.price?.unitName)}
                                </span>
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-muted-foreground">{t('items.analytics.latestChange')}</p>
                            <div className="mt-1">
                              {visiblePricesLoading ? (
                                <PriceCellSkeleton compact />
                              ) : visiblePricesUnavailable ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <PriceChangePill
                                  value={item.price?.changePercent ?? null}
                                  locale={locale}
                                  hasPurchaseHistory={hasPurchaseHistory}
                                  noPreviousLabel={t('items.analytics.noPreviousShort')}
                                  compact
                                />
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-muted-foreground">{t('items.analytics.suppliers')}</p>
                            <div className="mt-1">
                              {visiblePricesLoading ? (
                                <PriceCellSkeleton compact />
                              ) : visiblePricesUnavailable || !item.price ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="bg-primary/8 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold">
                                  <Building2 aria-hidden="true" className="size-3" />
                                  <span dir="ltr" className="tabular-nums">{item.price.supplierCount}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-muted-foreground">{t('items.analytics.lastPurchase')}</p>
                            <p className="mt-1 font-semibold tabular-nums">
                              {visiblePricesLoading ? (
                                <PriceCellSkeleton />
                              ) : item.price ? (
                                formatDateOnly(item.price.lastPurchaseDate, locale)
                              ) : '—'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

        </>}
        <TablePagination page={page} totalPages={totalPages} pageSize={pageSize} startRow={startRow} endRow={endRow} totalRows={data.total} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} />
      </>}
    </Card>
    <ItemEditorDialog open={createOpen} onOpenChange={setCreateOpen} />
    <ProcurementImportDialog
      open={importOpen}
      activeViewId={activeViewId}
      onOpenChange={setImportOpen}
      onApplied={(savedViewId) => changeView(savedViewId)}
    />
  </div>
}

function PriceCellSkeleton({ wide = false, compact = false }: { wide?: boolean; compact?: boolean }) {
  const width = compact ? 'w-10' : wide ? 'w-28' : 'w-20'
  return <span aria-hidden="true" className={`bg-muted inline-block h-4 ${width} animate-pulse rounded`} />
}

function PriceChangePill({
  value,
  locale,
  hasPurchaseHistory,
  noPreviousLabel,
  compact = false,
}: {
  value: number | null
  locale: string
  hasPurchaseHistory: boolean
  noPreviousLabel: string
  compact?: boolean
}) {
  if (!hasPurchaseHistory) {
    return <span className="text-muted-foreground">—</span>
  }

  if (value === null || !Number.isFinite(value)) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
        <Minus aria-hidden="true" className="size-3" />
        {noPreviousLabel}
      </span>
    )
  }

  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus
  const toneClass = value > 0
    ? 'bg-destructive/10 text-destructive'
    : value < 0
      ? 'bg-success/10 text-success'
      : 'bg-muted text-muted-foreground'

  return (
    <span
      dir="ltr"
      className={`inline-flex items-center gap-1 rounded-full font-semibold tabular-nums ${toneClass} ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {formatPercent(value, locale)}
    </span>
  )
}

