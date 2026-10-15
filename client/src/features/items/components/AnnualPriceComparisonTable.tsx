import { ArrowUpDown, ChartColumnIncreasing, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { TablePagination } from '@/components/shared/TablePagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AnnualLowestPurchase, AnnualPriceList } from '../types/item.types'
import { formatDateOnly, formatPercent, formatUnitCost } from './item-price-format'
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

export function AnnualPriceComparisonTable({ data, endingYear, onEndingYearChange, page, pageSize, onPageChange, onPageSizeChange, canOpenSuppliers, activeViewId }: {
  data: AnnualPriceList
  endingYear: number
  onEndingYearChange: (year: number) => void
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  canOpenSuppliers: boolean
  activeViewId: number | null
}) {
  const { t } = useTranslation()
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
        <div className="space-y-1">
          <label htmlFor="annual-ending-year" className="text-muted-foreground text-[11px] font-medium">{t('items.annual.endingYear')}</label>
          <Select value={String(endingYear)} onValueChange={value => onEndingYearChange(Number(value))}>
            <SelectTrigger id="annual-ending-year" aria-label={t('items.annual.endingYear')} className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YEAR_OPTIONS.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[11px]">
      <ArrowUpDown aria-hidden="true" className="size-3.5" />
      {t('items.annual.scopeNote')}
      {endingYear===currentYear ? <span className="text-primary font-semibold">{t('items.annual.currentYearYtd')}</span> : null}
    </div>
    {data.items.length===0 ? <div className="text-muted-foreground p-10 text-center text-sm">{t('items.emptyTitle')}</div> : <>
      <div className="hidden max-h-[68vh] overflow-auto md:block">
        <table className="w-full min-w-[78rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-30 bg-card">
            <tr>
              <th className="bg-accent sticky start-0 z-40 min-w-[18rem] border-e border-b px-4 py-3 text-start text-xs font-semibold">{t('items.name')}</th>
              {years.map((year) => <th key={year} className="bg-accent min-w-[15rem] border-e border-b px-4 py-3 text-center text-xs font-semibold text-primary">
                <span>{year}{year === currentYear ? ` (${t('items.annual.ytd')})` : ''}</span>
                <span className="text-muted-foreground mt-1 block text-[11px] font-normal">{t('items.annual.lowestAndSupplier')}</span>
              </th>)}
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
