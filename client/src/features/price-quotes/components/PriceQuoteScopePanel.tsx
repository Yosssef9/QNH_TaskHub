import { ArrowDown, ArrowUp, Plus, Tags } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateOnly, formatPercent, formatProcurementNumber, formatUnitCost } from '@/features/items/components/item-price-format'
import { usePriceQuoteAnalytics, usePriceQuotes } from '../hooks/use-price-quotes'
import type { ProcurementPricePeriod } from '../types/price-quote.types'
import { PriceQuoteEditorDialog } from './PriceQuoteEditorDialog'

export function PriceQuoteScopePanel({
  item,
  supplier,
  supplierIds,
  period,
}: {
  item?: { id: number; name: string; unit?: string | null } | undefined
  supplier?: { id: number; name: string; currency?: string | null } | undefined
  supplierIds?: number[] | undefined
  period: ProcurementPricePeriod
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const [createOpen, setCreateOpen] = useState(false)
  const analyticsQuery = useMemo(() => ({
    ...(item ? { itemId: item.id } : {}),
    ...(supplier ? { supplierId: supplier.id } : {}),
    ...(supplierIds?.length ? { supplierIds } : {}),
    period,
  }), [item, period, supplier, supplierIds])
  const analytics = usePriceQuoteAnalytics(item || supplier ? analyticsQuery : null)
  const list = usePriceQuotes({
    ...(item ? { itemId: item.id } : {}),
    ...(supplier ? { supplierId: supplier.id } : {}),
    ...(supplierIds?.length ? { supplierIds } : {}),
    period,
    status: 'ALL',
    page: 1,
    pageSize: 10,
    sortBy: 'quoteDate',
    sortDirection: 'desc',
  })

  if (analytics.isPending || list.isPending) return <LoadingState />
  if (analytics.isError || list.isError || !analytics.data || !list.data) {
    return <ErrorState onRetry={() => { void analytics.refetch(); void list.refetch() }} />
  }

  const latestSummary = analytics.data.supplierSummaries[0] ?? null
  const difference = item ? latestSummary?.differencePercent ?? null : null
  const quoteInfoColumnCount = 1 + (supplier ? 0 : 1) + (item ? 0 : 1)

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Tags className="size-4" />{t('priceQuotes.myQuoteHistory')}</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">{t('priceQuotes.scopeDescription')}</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" />{t('priceQuotes.create')}</Button>
        </div>
      </CardHeader>
      <CardContent>
        {analytics.data.quoteCount === 0 ? (
          <EmptyState className="border-0 py-8" icon={Tags} title={t('priceQuotes.emptyScopeTitle')} description={t('priceQuotes.emptyScopeDescription')} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={t('priceQuotes.latestQuote')} value={analytics.data.latest ? formatUnitCost(analytics.data.latest.quotedUnitCost, locale, analytics.data.latest.currencyCode, analytics.data.latest.unitName) : '—'} detail={analytics.data.latest ? `${analytics.data.latest.supplierName} · ${formatDateOnly(analytics.data.latest.quoteDate, locale)}` : '—'} />
              {item ? <Metric label={t('priceQuotes.lowestQuote')} value={analytics.data.lowest ? formatUnitCost(analytics.data.lowest.quotedUnitCost, locale, analytics.data.lowest.currencyCode, analytics.data.lowest.unitName) : '—'} detail={t('priceQuotes.recordsValue', { count: analytics.data.quoteCount })} /> : <Metric label={t('priceQuotes.activeQuotes')} value={analytics.data.activeQuoteCount.toLocaleString()} detail={t('priceQuotes.recordsValue', { count: analytics.data.quoteCount })} />}
              {item ? <Metric label={t('priceQuotes.averageQuote')} value={analytics.data.averageQuote === null || !analytics.data.latest ? '—' : formatUnitCost(analytics.data.averageQuote, locale, analytics.data.latest.currencyCode, analytics.data.latest.unitName)} detail={t('priceQuotes.suppliersValue', { count: analytics.data.supplierCount })} /> : <Metric label={t('priceQuotes.quoteRecords')} value={analytics.data.quoteCount.toLocaleString()} detail={t('priceQuotes.scopeRecordsHint')} />}
              <Metric
                label={t('priceQuotes.quoteVsActual')}
                value={formatPercent(difference, locale)}
                detail={difference === null ? t('priceQuotes.noComparableActual') : difference < 0 ? t('priceQuotes.belowActual') : difference > 0 ? t('priceQuotes.aboveActual') : t('priceQuotes.sameAsActual')}
                tone={difference === null ? 'neutral' : difference < 0 ? 'good' : difference > 0 ? 'bad' : 'neutral'}
              />
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[64rem] table-fixed text-sm">
                <caption className="sr-only">{t('priceQuotes.historyDescription')}</caption>
                <colgroup>
                  <col className="w-36" />
                  {!supplier ? <col className="w-72" /> : null}
                  {!item ? <col className="w-72" /> : null}
                  <col className="w-52" />
                  <col className="w-52" />
                  <col className="w-56" />
                </colgroup>
                <thead>
                  <tr className="border-b">
                    <th
                      scope="colgroup"
                      colSpan={quoteInfoColumnCount}
                      className="bg-muted/50 px-4 py-2.5 text-start text-[11px] font-semibold tracking-wide text-muted-foreground"
                    >
                      {t('priceQuotes.quoteInformation')}
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className="border-s bg-primary/10 px-4 py-2.5 text-center text-[11px] font-semibold tracking-wide text-primary"
                    >
                      {t('priceQuotes.priceComparison')}
                    </th>
                  </tr>
                  <tr className="bg-accent/80">
                    <th scope="col" className="px-4 py-3 text-center text-xs font-semibold">{t('priceQuotes.quoteDate')}</th>
                    {!supplier ? <th scope="col" className="border-s px-4 py-3 text-start text-xs font-semibold">{t('priceQuotes.supplier')}</th> : null}
                    {!item ? <th scope="col" className="border-s px-4 py-3 text-start text-xs font-semibold">{t('priceQuotes.item')}</th> : null}
                    <th scope="col" className="border-s bg-primary/5 px-4 py-3 text-center text-xs font-semibold">{t('priceQuotes.quotePrice')}</th>
                    <th scope="col" className="border-s bg-primary/5 px-4 py-3 text-center text-xs font-semibold">{t('priceQuotes.latestActual')}</th>
                    <th scope="col" className="border-s bg-primary/5 px-4 py-3 text-center text-xs font-semibold">{t('priceQuotes.difference')}</th>
                  </tr>
                </thead>
                <tbody>{list.data.items.map((quote) => (
                  <tr key={quote.id} className="border-t transition-colors even:bg-muted/20 hover:bg-accent/35">
                    <td className="px-4 py-4 text-center font-medium tabular-nums">{formatDateOnly(quote.quoteDate, locale)}</td>
                    {!supplier ? <td className="border-s px-4 py-4"><TableEntityLink kind="supplier" id={quote.supplierId} name={quote.supplierName} code={quote.supplierCode} compact /></td> : null}
                    {!item ? <td className="border-s px-4 py-4"><TableEntityLink kind="item" id={quote.itemId} name={quote.itemName} code={quote.itemCode} compact /></td> : null}
                    <td className="border-s px-4 py-4 text-center">
                      <PriceValue
                        value={quote.quotedUnitCost}
                        locale={locale}
                        currencyCode={quote.currencyCode}
                        unitName={quote.unitName}
                      />
                    </td>
                    <td className="border-s px-4 py-4 text-center">
                      <PriceValue
                        value={quote.latestActualUnitCost}
                        locale={locale}
                        currencyCode={quote.currencyCode}
                        unitName={quote.unitName}
                        emptyText={t('priceQuotes.noComparableActual')}
                      />
                    </td>
                    <td className="border-s px-4 py-4 text-center">
                      <Difference value={quote.differencePercent} locale={locale} />
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
      <PriceQuoteEditorDialog open={createOpen} initialItem={item} initialSupplier={supplier} onOpenChange={setCreateOpen} />
    </Card>
  )
}

function Metric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'good' | 'bad' }) {
  return <div className="bg-muted/35 rounded-xl border p-4">
    <p className="text-muted-foreground text-xs font-medium">{label}</p>
    <p dir="ltr" className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-destructive' : ''}`}>{value}</p>
    <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
  </div>
}
function PriceValue({
  value,
  locale,
  currencyCode,
  unitName,
  emptyText,
}: {
  value: number | null
  locale: string
  currencyCode: string | null
  unitName: string | null
  emptyText?: string
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-base font-semibold text-muted-foreground">—</span>
        {emptyText ? <span className="max-w-[11rem] text-xs leading-5 text-muted-foreground">{emptyText}</span> : null}
      </div>
    )
  }

  return (
    <div dir="ltr" className="flex flex-col items-center gap-1">
      <span className="text-base font-semibold tabular-nums">
        {formatProcurementNumber(value, locale)}
        {currencyCode?.trim() ? ` ${currencyCode.trim()}` : ''}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{unitName?.trim() || '—'}</span>
    </div>
  )
}

function Difference({ value, locale }: { value: number | null; locale: string }) {
  const { t } = useTranslation()

  if (value === null || !Number.isFinite(value)) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-base font-semibold text-muted-foreground">—</span>
        <span className="text-xs text-muted-foreground">{t('priceQuotes.notComparable')}</span>
      </div>
    )
  }

  const Icon = value < 0 ? ArrowDown : ArrowUp
  const detail = value < 0
    ? t('priceQuotes.belowActual')
    : value > 0
      ? t('priceQuotes.aboveActual')
      : t('priceQuotes.sameAsActual')

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        dir="ltr"
        className={`inline-flex items-center gap-1 font-semibold ${
          value < 0 ? 'text-success' : value > 0 ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        <Icon className="size-3.5" />
        {formatPercent(value, locale)}
      </span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  )
}
