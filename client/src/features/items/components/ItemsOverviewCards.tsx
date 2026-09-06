import { ArrowDown, ArrowUp, Building2, PackageSearch, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import type { PriceQuoteSummary } from '@/features/price-quotes/types/price-quote.types'
import type { ItemsOverview } from '../types/item.types'

export function ItemsOverviewCards({
  overview,
  quoteSummary,
}: {
  overview: ItemsOverview
  quoteSummary?: PriceQuoteSummary | undefined
}) {
  const { t } = useTranslation()
  const primary = [
    { key: 'totalItems', label: t('items.analytics.totalItems'), value: overview.totalItems, icon: PackageSearch },
    { key: 'purchasedItems', label: t('items.analytics.purchasedItems'), value: overview.purchasedItems, icon: PackageSearch },
    { key: 'suppliers', label: t('items.analytics.suppliers'), value: overview.supplierCount, icon: Building2 },
  ] as const

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {primary.map(({ key, label, value, icon: Icon }) => (
          <Card key={key} className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-muted-foreground text-xs font-medium">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div>
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl"><Icon aria-hidden="true" className="size-5" /></span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/25 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="text-warning-foreground size-4" />{t('items.analytics.needsAttention')}</p>
        </div>
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <Attention label={t('items.analytics.priceIncreases')} value={overview.priceIncreases} icon={ArrowUp} tone="bad" />
          <Attention label={t('items.analytics.priceDecreases')} value={overview.priceDecreases} icon={ArrowDown} tone="good" />
          <Attention label={t('items.analytics.latestAtHistoricalHigh')} value={overview.latestAtHistoricalHigh} icon={ArrowUp} tone="warn" />
          <Attention label={t('priceQuotes.belowActualCount')} value={quoteSummary?.quotesBelowLatestActualCount ?? 0} icon={ArrowDown} tone="good" />
        </div>
      </Card>
    </div>
  )
}

function Attention({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof ArrowUp; tone: 'good' | 'bad' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-success bg-success/10' : tone === 'bad' ? 'text-destructive bg-destructive/10' : 'text-warning-foreground bg-warning/10'
  return <div className="flex items-center gap-3 p-4"><span className={`${toneClass} grid size-9 shrink-0 place-items-center rounded-lg`}><Icon className="size-4" /></span><div><p className="text-muted-foreground text-xs">{label}</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p></div></div>
}
