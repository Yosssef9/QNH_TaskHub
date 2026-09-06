import { Building2, ChartNoAxesColumnIncreasing, History, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import type { ItemPriceAnalytics } from '../types/item.types'
import { formatDateOnly, formatPercent, formatProcurementNumber, formatUnitCost } from './item-price-format'

export function ItemPriceSummaryCards({ analytics }: { analytics: ItemPriceAnalytics }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const scope = analytics.scope
  const change = analytics.changePercent
  const changeTone = change === null ? 'text-muted-foreground' : change < 0 ? 'text-success' : change > 0 ? 'text-destructive' : 'text-muted-foreground'
  const ChangeIcon = change !== null && change < 0 ? TrendingDown : TrendingUp

  const secondary = [
    { key: 'lowest', label: t('items.analytics.lowestHistorical'), value: formatUnitCost(analytics.lowest?.unitCost ?? null, locale, scope?.currencyCode, scope?.unitName), detail: analytics.lowest ? `${analytics.lowest.supplierName} · ${formatDateOnly(analytics.lowest.transactionDate, locale)}` : t('items.analytics.noPrice'), icon: TrendingDown },
    { key: 'highest', label: t('items.analytics.highestHistorical'), value: formatUnitCost(analytics.highest?.unitCost ?? null, locale, scope?.currencyCode, scope?.unitName), detail: analytics.highest ? `${analytics.highest.supplierName} · ${formatDateOnly(analytics.highest.transactionDate, locale)}` : t('items.analytics.noPrice'), icon: TrendingUp },
    { key: 'average', label: t('items.analytics.averageActual'), value: formatUnitCost(analytics.averageUnitCost, locale, scope?.currencyCode, scope?.unitName), detail: t('items.analytics.transactionCountValue', { count: analytics.transactionCount }), icon: ChartNoAxesColumnIncreasing },
    { key: 'suppliers', label: t('items.analytics.supplierCount'), value: formatProcurementNumber(analytics.supplierCount, locale, 0), detail: t('items.analytics.lastPurchaseValue', { date: formatDateOnly(analytics.lastPurchaseDate, locale) }), icon: Building2 },
  ] as const

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden border-primary/20">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t('items.analytics.latestActual')}</p>
                <p dir="ltr" className="mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">{formatUnitCost(analytics.latest?.unitCost ?? null, locale, scope?.currencyCode, scope?.unitName)}</p>
                <p className="text-muted-foreground mt-2 text-sm">{analytics.latest ? `${analytics.latest.supplierName} · ${formatDateOnly(analytics.latest.transactionDate, locale)}` : t('items.analytics.noPrice')}</p>
              </div>
              <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl"><History className="size-5" /></span>
            </div>
          </div>
          <div className="bg-muted/35 border-t p-5 lg:border-s lg:border-t-0 sm:p-6">
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t('items.analytics.latestChange')}</p>
            <div className={`mt-2 flex items-center gap-2 ${changeTone}`}><ChangeIcon className="size-5" /><p dir="ltr" className="text-2xl font-bold tabular-nums">{formatPercent(change, locale)}</p></div>
            <p className="text-muted-foreground mt-2 text-xs">{analytics.previous ? `${t('items.analytics.previousActual')}: ${formatUnitCost(analytics.previous.unitCost, locale, scope?.currencyCode, scope?.unitName)} · ${analytics.previous.supplierName}` : t('items.analytics.noPrevious')}</p>
            {analytics.changeAmount !== null ? <p dir="ltr" className={`mt-1 text-xs font-medium ${changeTone}`}>{formatUnitCost(analytics.changeAmount, locale, scope?.currencyCode, scope?.unitName)}</p> : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {secondary.map(({ key, label, value, detail, icon: Icon }) => (
          <Card key={key} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-muted-foreground text-xs font-medium">{label}</p><p dir="ltr" className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p><p className="text-muted-foreground mt-1 truncate text-xs">{detail}</p></div>
              <span className="bg-primary/8 text-primary grid size-8 shrink-0 place-items-center rounded-lg"><Icon className="size-4" /></span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
