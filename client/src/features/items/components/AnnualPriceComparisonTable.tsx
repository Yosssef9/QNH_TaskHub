import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChartColumnIncreasing, Minus, TrendingDown, TrendingUp, Wallet, PackageCheck, Info, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { TablePagination } from '@/components/shared/TablePagination'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AnnualLowestPurchase, AnnualPriceItem, AnnualPriceList, AnnualPriceSortBy, SortDirection } from '../types/item.types'
import { formatDateOnly, formatPercent, formatProcurementNumber, formatUnitCost } from './item-price-format'
import { AnnualPriceSparkline } from './AnnualPriceSparkline'

const YEAR_OPTIONS = [2026, 2027] as const

function ChangeIndicator({ percent }: { percent: number | null }) {
  const { i18n, t } = useTranslation()
  if (percent === null) return <span className="text-muted-foreground text-xs">{t('items.annual.notComparable')}</span>
  const Icon = percent < 0 ? TrendingDown : percent > 0 ? TrendingUp : Minus
  const tone = percent < 0 ? 'bg-success/10 text-success' : percent > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
  return <span dir="ltr" className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${tone}`}>
    <Icon aria-hidden="true" className="size-3.5" />{formatPercent(percent, i18n.language)}
  </span>
}

function AnnualPurchaseCell({ value, currencyCode, canOpenSuppliers, itemUrl }: {
  value: AnnualLowestPurchase
  currencyCode: string | null
  canOpenSuppliers: boolean
  itemUrl: string
}) {
  const { i18n, t } = useTranslation()
  if (value.unitCost === null) return <span className="text-muted-foreground text-xs">{t('items.annual.noPurchase')}</span>
  return <div className="flex flex-col items-center gap-1.5">
    <Link to={itemUrl} title={[
      t('items.annual.openHistory'),
      value.transactionDate ? `${t('items.annual.trendDate')}: ${formatDateOnly(value.transactionDate, i18n.language)}` : null,
      value.invoiceNo ? `${t('items.annual.invoice')}: ${value.invoiceNo}` : null,
    ].filter(Boolean).join(' · ')}
      className="text-foreground hover:text-primary text-sm font-bold tabular-nums underline-offset-2 hover:underline" dir="ltr">
      {formatUnitCost(value.unitCost, i18n.language, currencyCode)}
    </Link>
    {value.supplierId !== null && value.supplierName ? <TableEntityLink
      kind="supplier" id={value.supplierId} name={value.supplierName} code={value.supplierCode}
      compact enabled={canOpenSuppliers} className="max-w-[12rem]" /> : <span className="text-muted-foreground text-xs">—</span>}
  </div>
}

function sarAmount(value: number, locale: string, signed = false): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(normalized)
  return `${signed && normalized > 0 ? '+' : ''}${formatted} SAR`
}

function comparableYearCount(item: AnnualPriceItem, selectedSavingsYears: readonly number[]): number {
  return item.savingsByYear.filter(year => selectedSavingsYears.includes(year.year) && year.savings !== null).length
}

function SavingsAmount({ item, selectedSavingsYears }: { item: AnnualPriceItem; selectedSavingsYears: readonly number[] }) {
  const { i18n, t } = useTranslation()
  const amount = item.totalSavings
  const comparableYears = comparableYearCount(item, selectedSavingsYears)
  const isPartial = amount !== null && comparableYears < selectedSavingsYears.length
  const hasOnlyOnePurchaseYear = item.purchaseYearCount === 1
  const color = amount === null ? 'text-muted-foreground' : amount > 0 ? 'text-success' : amount < 0 ? 'text-destructive' : 'text-muted-foreground'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-bold tabular-nums underline-offset-4 hover:bg-muted/60 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${color}`}
          aria-label={`${item.itemName}: ${t('items.annual.totalSavings')}: ${amount === null ? t('items.annual.incomplete') : sarAmount(amount, i18n.language, true)}`}>
          {amount === null ? t('items.annual.incomplete') : sarAmount(amount, i18n.language, true)}
          <Info aria-hidden="true" className="size-3.5 shrink-0 opacity-65" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[min(26rem,calc(100vw-2rem))] space-y-3 p-4">
        <div>
          <p className="text-sm font-semibold">{item.itemName}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t('items.annual.breakdownTitle')}</p>
          <p className="text-muted-foreground mt-1 text-xs font-medium">
            {amount === null ? (hasOnlyOnePurchaseYear ? t('items.annual.oneYearExcluded') : t('items.annual.incomplete')) : isPartial
              ? t('items.annual.partialYears', { count: comparableYears, total: selectedSavingsYears.length })
              : t('items.annual.completeYears', { total: selectedSavingsYears.length })}
          </p>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {item.savingsByYear.map(year => (
            <div key={year.year} className={`rounded-lg border p-3 ${selectedSavingsYears.includes(year.year) ? 'bg-muted/15' : 'bg-muted/5 opacity-60'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tabular-nums">{year.year} {t('items.annual.changeFrom', { year: year.year - 1 })}
                  {!selectedSavingsYears.includes(year.year) ? <span className="text-muted-foreground ms-2 font-normal">({t('items.annual.notSelected')})</span> : null}
                </p>
                <span dir="ltr" className={`text-xs font-bold tabular-nums ${year.savings === null ? 'text-muted-foreground' : year.savings > 0 ? 'text-success' : year.savings < 0 ? 'text-destructive' : ''}`}>
                  {year.savings === null ? t('items.annual.incomplete') : sarAmount(year.savings, i18n.language, true)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><p className="text-muted-foreground">{t('items.annual.benchmark')}</p><p className="font-medium tabular-nums">{formatProcurementNumber(year.benchmarkPrice, i18n.language, 6)}</p></div>
                <div><p className="text-muted-foreground">{t('items.annual.quantity')}</p><p className="font-medium tabular-nums">{formatProcurementNumber(year.quantity, i18n.language, 6)}</p></div>
                <div><p className="text-muted-foreground">{t('items.annual.expectedSpent')}</p><p className="font-medium tabular-nums">{year.benchmarkPrice === null || year.quantity === null ? '—' : sarAmount(year.benchmarkPrice * year.quantity, i18n.language)}</p></div>
                <div><p className="text-muted-foreground">{t('items.annual.actualSpent')}</p><p className="font-medium tabular-nums">{year.actualSpending === null ? '—' : sarAmount(year.actualSpending, i18n.language)}</p></div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-2 text-sm font-semibold">
          <span>{t('items.annual.totalSavings')}</span>
          <span dir="ltr" className={color}>{amount === null ? t('items.annual.incomplete') : sarAmount(amount, i18n.language, true)}</span>
        </div>
        <p className="text-muted-foreground text-[11px]">{t('items.annual.savingsDefinition')}</p>
        {hasOnlyOnePurchaseYear ? (
          <p className="text-muted-foreground text-[11px]">{t('items.annual.oneYearExplanation')}</p>
        ) : isPartial || amount === null ? (
          <p className="text-muted-foreground text-[11px]">{t('items.annual.incompleteReason')}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function AnnualPriceComparisonTable({ data, endingYear, onEndingYearChange, selectedSavingsYears, onSelectedSavingsYearsChange, sortBy, sortDirection, onSort, onResetSort, page, pageSize, onPageChange, onPageSizeChange, canOpenSuppliers, activeViewId }: {
  data: AnnualPriceList
  endingYear: number
  onEndingYearChange: (year: number) => void
  selectedSavingsYears: number[]
  onSelectedSavingsYearsChange: (years: number[]) => void
  sortBy: AnnualPriceSortBy
  sortDirection: SortDirection
  onSort: (column: 'currentPrice' | 'totalSavings') => void
  onResetSort: () => void
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  canOpenSuppliers: boolean
  activeViewId: number | null
}) {
  const { t, i18n } = useTranslation()
  const years = [endingYear - 2, endingYear - 1, endingYear] as const
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))
  const currentYear = new Date().getFullYear()
  const detailsUrl = (id: number) => `/items/${id}${activeViewId ? `?view=${activeViewId}&period=ALL` : '?period=ALL'}`

  return <>
    <div className="bg-muted/15 flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold"><ChartColumnIncreasing aria-hidden="true" className="size-4 text-primary" />{t('items.annual.title')}</p>
        <p className="text-muted-foreground mt-1 text-xs">{t('items.annual.description')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {sortBy !== 'performance' ? (
          <Button type="button" size="sm" variant="outline" onClick={onResetSort} className="h-10">
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {t('items.annual.resetBestImprovement')}
          </Button>
        ) : null}
        <div className="space-y-1">
          <p className="text-muted-foreground text-[11px] font-medium">{t('items.annual.savingsPeriod')}</p>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-10 min-w-[12rem] justify-between gap-2" aria-label={t('items.annual.savingsPeriod')}>
                <span>{t('items.annual.comparisonsSelected', { count: selectedSavingsYears.length, total: 3 })}</span>
                <ChevronDown aria-hidden="true" className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(19rem,calc(100vw-2rem))] space-y-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t('items.annual.savingsPeriod')}</p>
                <Button type="button" variant="ghost" size="sm" disabled={selectedSavingsYears.length === 3}
                  onClick={() => onSelectedSavingsYearsChange([...years])}>
                  {t('items.annual.selectAll')}
                </Button>
              </div>
              {years.map(year => {
                const checked = selectedSavingsYears.includes(year)
                const disabled = checked && selectedSavingsYears.length === 1
                return <label key={year} className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/60 ${disabled ? 'opacity-65' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="size-4 accent-primary" checked={checked} disabled={disabled}
                    onChange={event => onSelectedSavingsYearsChange(
                      event.target.checked
                        ? years.filter(value => selectedSavingsYears.includes(value) || value === year)
                        : selectedSavingsYears.filter(value => value !== year)
                    )} />
                  <span dir="ltr" className="tabular-nums">{year - 1} → {year}</span>
                  {checked ? <Check aria-hidden="true" className="ms-auto size-3.5 text-primary" /> : null}
                </label>
              })}
              <p className="text-muted-foreground text-xs">{t('items.annual.atLeastOneComparison')}</p>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <label htmlFor="annual-ending-year" className="text-muted-foreground text-[11px] font-medium">{t('items.annual.endingYear')}</label>
          <Select value={String(endingYear)} onValueChange={value => onEndingYearChange(Number(value))}>
            <SelectTrigger id="annual-ending-year" aria-label={t('items.annual.endingYear')} className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YEAR_OPTIONS.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
    <div className="grid gap-3 border-b px-4 py-4 sm:grid-cols-2">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium"><Wallet aria-hidden="true" className="size-4" />{t('items.annual.totalSavingsAll')}</div>
        <div dir="ltr" className={`mt-2 text-start text-2xl font-bold tabular-nums ${data.savingsIncludedItems === 0 ? 'text-muted-foreground' : data.totalEstimatedSavings > 0 ? 'text-success' : data.totalEstimatedSavings < 0 ? 'text-destructive' : ''}`}>
          {data.savingsIncludedItems === 0 ? '—' : sarAmount(data.totalEstimatedSavings, i18n.language, true)}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{years[0]}–{years[2]} · {t('items.annual.allMatchingItems')} · {t('items.annual.comparisonsSelected', { count: selectedSavingsYears.length, total: 3 })}</p>
        {data.savingsPartialItems > 0 ? (
          <p className="text-muted-foreground mt-1 text-xs">{t('items.annual.partialItems', { count: data.savingsPartialItems })}</p>
        ) : null}
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium"><PackageCheck aria-hidden="true" className="size-4" />{t('items.annual.itemsIncluded')}</div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{formatProcurementNumber(data.savingsIncludedItems, i18n.language, 0)}</div>
        <p className="text-muted-foreground mt-1 text-xs">{t('items.annual.itemsExcluded', { count: data.savingsExcludedItems })}</p>
      </div>
    </div>
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[11px]">
      <ArrowUpDown aria-hidden="true" className="size-3.5" />
      {t('items.annual.scopeNote')}
      {endingYear===currentYear ? <span className="text-primary font-semibold">{t('items.annual.currentYearYtd')}</span> : null}
    </div>
    {data.items.length===0 ? <div className="text-muted-foreground p-10 text-center text-sm">{t('items.emptyTitle')}</div> : <>
      <div className="hidden max-h-[68vh] overflow-auto md:block">
        <table className="w-full min-w-[88rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-30 bg-card">
            <tr>
              <th className="bg-accent sticky start-0 z-40 min-w-[18rem] border-e border-b px-4 py-3 text-start text-xs font-semibold">{t('items.name')}</th>
              {years.map((year) => <th key={year} aria-sort={year === endingYear && sortBy === 'currentPrice' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                className="bg-accent min-w-[15rem] border-e border-b px-4 py-3 text-center text-xs font-semibold text-primary">
                {year === endingYear ? (
                  <button type="button" onClick={() => onSort('currentPrice')}
                    aria-label={t('items.annual.sortLatestPrice', { year })}
                    className="mx-auto inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {year}{year === currentYear ? ` (${t('items.annual.ytd')})` : ''}
                    {sortBy === 'currentPrice' ? (sortDirection === 'asc' ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />) : <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-60" />}
                  </button>
                ) : <span>{year}{year === currentYear ? ` (${t('items.annual.ytd')})` : ''}</span>}
                <span className="text-muted-foreground mt-1 block text-[11px] font-normal">{t('items.annual.lowestAndSupplier')}</span>
              </th>)}
              <th aria-sort={sortBy === 'totalSavings' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                className="bg-accent min-w-[13rem] border-e border-b px-4 py-3 text-center text-xs font-semibold text-primary">
                <button type="button" onClick={() => onSort('totalSavings')}
                  aria-label={t('items.annual.sortSavings')}
                  className="mx-auto inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {t('items.annual.totalSavings')}
                  {sortBy === 'totalSavings' ? (sortDirection === 'asc' ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />) : <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-60" />}
                </button>
              </th>
              <th className="bg-accent min-w-[12rem] border-b px-4 py-3 text-center text-xs font-semibold text-primary">{t('items.annual.priceTrend')}</th>
            </tr>
          </thead>
          <tbody>{data.items.map(item => <tr key={item.itemId} className="group hover:bg-primary/[0.035] even:bg-muted/10">
            <th className="bg-card group-hover:bg-accent sticky start-0 z-20 min-w-[18rem] border-e border-b px-4 py-3 text-start align-middle">
              <TableEntityLink kind="item" id={item.itemId} name={item.itemName} code={item.itemCode} to={detailsUrl(item.itemId)} compact className="max-w-[20rem]" />
              <p className="text-muted-foreground mt-1 text-xs">{[item.categoryName, item.unitName].filter(Boolean).join(' · ')}</p>
            </th>
            {item.prices.map((price, index) => <td key={price.year} className="border-e border-b px-4 py-3 text-center align-middle">
              <div className="flex flex-col items-center gap-2">
                <AnnualPurchaseCell value={price} currencyCode={item.currencyCode} itemUrl={detailsUrl(item.itemId)} canOpenSuppliers={canOpenSuppliers} />
                {index > 0 ? <ChangeIndicator percent={index === 1 ? item.previousChangePercent : item.latestChangePercent} /> : null}
              </div>
            </td>)}
            <td className="border-e border-b px-3 py-3 text-center align-middle">
              <div className="flex flex-col items-center gap-1">
                <SavingsAmount item={item} selectedSavingsYears={selectedSavingsYears} />
                {item.purchaseYearCount === 1 ? (
                  <span className="text-muted-foreground text-[11px]">{t('items.annual.oneYearExcluded')}</span>
                ) : null}
                {item.totalSavings !== null && comparableYearCount(item, selectedSavingsYears) < selectedSavingsYears.length ? (
                  <span className="text-muted-foreground text-[11px]">{t('items.annual.partialYears', { count: comparableYearCount(item, selectedSavingsYears), total: selectedSavingsYears.length })}</span>
                ) : null}
              </div>
            </td>
            <td className="border-b px-4 py-3 text-center align-middle">
              <AnnualPriceSparkline prices={item.prices} currencyCode={item.currencyCode} unitName={item.unitName} previousChangePercent={item.previousChangePercent} latestChangePercent={item.latestChangePercent} />
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="divide-y md:hidden">{data.items.map(item=><div key={item.itemId} className="space-y-3 p-4">
        <TableEntityLink kind="item" id={item.itemId} name={item.itemName} code={item.itemCode} to={detailsUrl(item.itemId)} compact />
        <p className="text-muted-foreground text-xs">{[item.categoryName,item.unitName].filter(Boolean).join(' · ')}</p>
        <div className="grid gap-2">{item.prices.map((p, i) => <div key={p.year} className="bg-muted/30 rounded-lg p-3">
          <p className="text-muted-foreground text-xs font-semibold">{p.year}{p.year === currentYear ? ` (${t('items.annual.ytd')})` : ''}</p>
          <div className="mt-2 text-sm font-bold tabular-nums" dir="ltr">{formatUnitCost(p.unitCost, 'en', item.currencyCode)}</div>
          <p className="text-muted-foreground mt-1 text-xs">{p.supplierName ?? t('items.annual.noPurchase')}</p>
          {i > 0 ? <div className="mt-2"><ChangeIndicator percent={i === 1 ? item.previousChangePercent : item.latestChangePercent} /></div> : null}
        </div>)}</div>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <p className="text-muted-foreground text-xs font-semibold">{t('items.annual.totalSavings')}</p>
          <div className="flex flex-col items-end gap-1">
            <SavingsAmount item={item} selectedSavingsYears={selectedSavingsYears} />
            {item.purchaseYearCount === 1 ? (
              <span className="text-muted-foreground text-[11px]">{t('items.annual.oneYearExcluded')}</span>
            ) : null}
            {item.totalSavings !== null && comparableYearCount(item, selectedSavingsYears) < selectedSavingsYears.length ? (
              <span className="text-muted-foreground text-[11px]">{t('items.annual.partialYears', { count: comparableYearCount(item, selectedSavingsYears), total: selectedSavingsYears.length })}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <p className="text-muted-foreground text-xs font-semibold">{t('items.annual.priceTrend')}</p>
          <AnnualPriceSparkline prices={item.prices} currencyCode={item.currencyCode} unitName={item.unitName} previousChangePercent={item.previousChangePercent} latestChangePercent={item.latestChangePercent} />
        </div>
      </div>)}</div>
    </>}
    <TablePagination page={page} totalPages={totalPages} pageSize={pageSize}
      startRow={data.total?(page-1)*pageSize+1:0} endRow={Math.min(page*pageSize,data.total)} totalRows={data.total}
      onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}/>
  </>
}
