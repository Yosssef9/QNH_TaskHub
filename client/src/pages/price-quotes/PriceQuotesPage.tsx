import { ArrowDown, ArrowUp, History, Pencil, Plus, RotateCcw, SearchX, Tags } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { TablePagination } from '@/components/shared/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  formatDateOnly,
  formatPercent,
  formatUnitCost,
} from '@/features/items/components/item-price-format'
import { PriceQuoteEditorDialog } from '@/features/price-quotes/components/PriceQuoteEditorDialog'
import { PriceQuoteHistoryDialog } from '@/features/price-quotes/components/PriceQuoteHistoryDialog'
import {
  usePriceQuoteSummary,
  usePriceQuotes,
  useSetPriceQuoteActive,
} from '@/features/price-quotes/hooks/use-price-quotes'
import type {
  PriceQuote,
  ProcurementPricePeriod,
  QuoteSortBy,
  QuoteStatusFilter,
} from '@/features/price-quotes/types/price-quote.types'
import { useSortState } from '@/hooks/use-sort-state'
import { ApiClientError } from '@/lib/api-error'

const PERIODS: ProcurementPricePeriod[] = ['1M', '3M', '6M', '1Y', 'ALL']

export function PriceQuotesPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<ProcurementPricePeriod>('1Y')
  const [status, setStatus] = useState<QuoteStatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<PriceQuote | null>(null)
  const [history, setHistory] = useState<PriceQuote | null>(null)
  const [lifecycle, setLifecycle] = useState<PriceQuote | null>(null)
  const sort = useSortState<QuoteSortBy>('quoteDate', 'desc')
  const query = usePriceQuotes({
    search,
    period,
    status,
    page,
    pageSize,
    sortBy: sort.sortColumn ?? 'quoteDate',
    sortDirection: sort.sortDirection,
  })
  const summary = usePriceQuoteSummary({ itemIds: [], supplierIds: [], period })
  const setActive = useSetPriceQuoteActive()
  const data = query.data
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const startRow = data?.total ? (page - 1) * pageSize + 1 : 0
  const endRow = Math.min(page * pageSize, data?.total ?? 0)

  async function toggleLifecycle() {
    if (!lifecycle) return
    try {
      await setActive.mutateAsync({
        id: lifecycle.id,
        active: !lifecycle.isActive,
        rowVersion: lifecycle.rowVersion,
      })
      toast.success(t(lifecycle.isActive ? 'priceQuotes.deactivated' : 'priceQuotes.reactivated'))
      setLifecycle(null)
    } catch (error) {
      toast.error(
        t(
          error instanceof ApiClientError && error.code === 'PRICE_QUOTE_STALE'
            ? 'priceQuotes.errors.stale'
            : 'priceQuotes.errors.save',
        ),
      )
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('procurement.title')}
        title={t('priceQuotes.pageTitle')}
        description={t('priceQuotes.pageDescription')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('priceQuotes.create')}
          </Button>
        }
      />

      {summary.isPending ? (
        <LoadingState className="py-7" />
      ) : summary.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label={t('priceQuotes.activeQuotes')}
            value={summary.data.activeQuoteCount}
            icon={Tags}
          />
          <SummaryCard
            label={t('priceQuotes.quotedItems')}
            value={summary.data.quotedItemCount}
            icon={History}
          />
          <SummaryCard
            label={t('priceQuotes.belowActualCount')}
            value={summary.data.quotesBelowLatestActualCount}
            icon={ArrowDown}
            accent
          />
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            className="xl:max-w-md"
            placeholder={t('priceQuotes.searchPlaceholder')}
            ariaLabel={t('priceQuotes.searchLabel')}
          />
          <div className="flex flex-wrap gap-2">
            <Select
              value={period}
              onValueChange={(value) => {
                setPeriod(value as ProcurementPricePeriod)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`savedViews.periods.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as QuoteStatusFilter)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('priceQuotes.allStatuses')}</SelectItem>
                <SelectItem value="ACTIVE">{t('priceQuotes.active')}</SelectItem>
                <SelectItem value="INACTIVE">{t('priceQuotes.inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {query.isPending ? (
          <LoadingState className="rounded-none border-0" />
        ) : query.isError || !data ? (
          <ErrorState className="rounded-none border-0" onRetry={() => void query.refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={SearchX}
            title={t('priceQuotes.emptyTitle')}
            description={t('priceQuotes.emptyDescription')}
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                {t('priceQuotes.create')}
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[66rem] text-sm">
                <thead>
                  <tr>
                    <SortableHeader
                      label={t('priceQuotes.quoteDate')}
                      column="quoteDate"
                      sortColumn={sort.sortColumn}
                      sortDirection={sort.sortDirection}
                      onSort={(column) => {
                        sort.handleSort(column)
                        setPage(1)
                      }}
                      tone="soft-primary"
                    />
                    <SortableHeader
                      label={t('priceQuotes.item')}
                      column="item"
                      sortColumn={sort.sortColumn}
                      sortDirection={sort.sortDirection}
                      onSort={(column) => {
                        sort.handleSort(column)
                        setPage(1)
                      }}
                      tone="soft-primary"
                    />
                    <SortableHeader
                      label={t('priceQuotes.supplier')}
                      column="supplier"
                      sortColumn={sort.sortColumn}
                      sortDirection={sort.sortDirection}
                      onSort={(column) => {
                        sort.handleSort(column)
                        setPage(1)
                      }}
                      tone="soft-primary"
                    />
                    <SortableHeader
                      label={t('priceQuotes.quotedUnitCost')}
                      column="quotedUnitCost"
                      sortColumn={sort.sortColumn}
                      sortDirection={sort.sortDirection}
                      onSort={(column) => {
                        sort.handleSort(column)
                        setPage(1)
                      }}
                      tone="soft-primary"
                    />
                    <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-start text-xs font-semibold">
                      {t('priceQuotes.latestActual')}
                    </th>
                    <SortableHeader
                      label={t('priceQuotes.difference')}
                      column="difference"
                      sortColumn={sort.sortColumn}
                      sortDirection={sort.sortDirection}
                      onSort={(column) => {
                        sort.handleSort(column)
                        setPage(1)
                      }}
                      tone="soft-primary"
                    />
                    <SortableHeader
                      label={t('priceQuotes.status')}
                      column="status"
                      sortColumn={sort.sortColumn}
                      sortDirection={sort.sortDirection}
                      onSort={(column) => {
                        sort.handleSort(column)
                        setPage(1)
                      }}
                      tone="soft-primary"
                    />
                    <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-end text-xs font-semibold">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((quote) => (
                    <tr
                      key={quote.id}
                      className="hover:bg-primary/[0.035] border-b last:border-b-0"
                    >
                      <td className="px-4 py-4">{formatDateOnly(quote.quoteDate, locale)}</td>
                      <td className="px-4 py-4"><TableEntityLink kind="item" id={quote.itemId} name={quote.itemName} code={quote.itemCode} compact /></td>
                      <td className="px-4 py-4"><TableEntityLink kind="supplier" id={quote.supplierId} name={quote.supplierName} code={quote.supplierCode} compact /></td>
                      <td dir="ltr" className="px-4 py-4 font-semibold tabular-nums">
                        {formatUnitCost(
                          quote.quotedUnitCost,
                          locale,
                          quote.currencyCode,
                          quote.unitName,
                        )}
                      </td>
                      <td dir="ltr" className="px-4 py-4 tabular-nums">
                        {formatUnitCost(
                          quote.latestActualUnitCost,
                          locale,
                          quote.currencyCode,
                          quote.unitName,
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Difference value={quote.differencePercent} locale={locale} />
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={quote.isActive ? 'success' : 'secondary'}>
                          {t(quote.isActive ? 'priceQuotes.active' : 'priceQuotes.inactive')}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('common.edit')}
                            onClick={() => setEditing(quote)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('priceQuotes.history')}
                            onClick={() => setHistory(quote)}
                          >
                            <History className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t(
                              quote.isActive ? 'priceQuotes.deactivate' : 'priceQuotes.reactivate',
                            )}
                            onClick={() => setLifecycle(quote)}
                          >
                            {quote.isActive ? (
                              <Tags className="size-4" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {data.items.map((quote) => (
                <div key={quote.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{quote.itemName}</p>
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {quote.supplierName}
                      </p>
                    </div>
                    <Badge variant={quote.isActive ? 'success' : 'secondary'}>
                      {t(quote.isActive ? 'priceQuotes.active' : 'priceQuotes.inactive')}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">{t('priceQuotes.quote')}</p>
                      <p dir="ltr" className="mt-1 font-semibold">
                        {formatUnitCost(
                          quote.quotedUnitCost,
                          locale,
                          quote.currencyCode,
                          quote.unitName,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('priceQuotes.difference')}</p>
                      <Difference value={quote.differencePercent} locale={locale} />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(quote)}>
                      {t('common.edit')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistory(quote)}>
                      {t('priceQuotes.history')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              startRow={startRow}
              endRow={endRow}
              totalRows={data.total}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value)
                setPage(1)
              }}
            />
          </>
        )}
      </Card>

      <PriceQuoteEditorDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PriceQuoteEditorDialog
        open={editing !== null}
        quote={editing ?? undefined}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      {history ? (
        <PriceQuoteHistoryDialog
          open
          quote={history}
          onOpenChange={(open) => !open && setHistory(null)}
        />
      ) : null}
      <ConfirmModal
        open={lifecycle !== null}
        title={t(
          lifecycle?.isActive ? 'priceQuotes.deactivateTitle' : 'priceQuotes.reactivateTitle',
        )}
        message={t(
          lifecycle?.isActive
            ? 'priceQuotes.deactivateDescription'
            : 'priceQuotes.reactivateDescription',
        )}
        confirmText={t(lifecycle?.isActive ? 'priceQuotes.deactivate' : 'priceQuotes.reactivate')}
        cancelText={t('common.cancel')}
        danger={Boolean(lifecycle?.isActive)}
        onConfirm={() => void toggleLifecycle()}
        onCancel={() => setLifecycle(null)}
      />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: number
  icon: typeof Tags
  accent?: boolean
}) {
  return (
    <Card className={`p-5 ${accent ? 'border-success/30 bg-success/5' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        </div>
        <span
          className={`${accent ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'} grid size-10 place-items-center rounded-xl`}
        >
          <Icon className="size-5" />
        </span>
      </div>
    </Card>
  )
}
function Difference({ value, locale }: { value: number | null; locale: string }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const Icon = value < 0 ? ArrowDown : ArrowUp
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center gap-1 font-semibold ${value < 0 ? 'text-success' : value > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
    >
      <Icon className="size-3.5" />
      {formatPercent(value, locale)}
    </span>
  )
}
