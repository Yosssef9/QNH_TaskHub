import { Boxes, CalendarClock, CircleDollarSign, Rows3, Trophy, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { formatDateOnly, formatPercent, formatProcurementNumber } from '@/features/items/components/item-price-format'
import type { SupplierPriceAnalytics } from '../types/supplier.types'

export function SupplierIntelligenceCards({ analytics }: { analytics: SupplierPriceAnalytics }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const cards = [
    {
      key: 'items',
      icon: Boxes,
      label: t('suppliers.intelligence.itemsPurchased'),
      value: formatProcurementNumber(analytics.itemCount, locale, 0),
    },
    {
      key: 'transactions',
      icon: Rows3,
      label: t('suppliers.intelligence.transactionCount'),
      value: formatProcurementNumber(analytics.transactionCount, locale, 0),
    },
    {
      key: 'lastPurchase',
      icon: CalendarClock,
      label: t('suppliers.intelligence.lastPurchase'),
      value: formatDateOnly(analytics.lastPurchaseDate, locale),
    },
    {
      key: 'lowest',
      icon: Trophy,
      label: t('suppliers.intelligence.currentlyLowest'),
      value: formatProcurementNumber(analytics.currentLowestItemCount, locale, 0),
      hint: t('suppliers.intelligence.ofComparable', { count: analytics.comparableItemCount }),
    },
    {
      key: 'highest',
      icon: TriangleAlert,
      label: t('suppliers.intelligence.currentlyHighest'),
      value: formatProcurementNumber(analytics.currentHighestItemCount, locale, 0),
      hint: t('suppliers.intelligence.ofComparable', { count: analytics.comparableItemCount }),
    },
    {
      key: 'difference',
      icon: CircleDollarSign,
      label: t('suppliers.intelligence.averageGap'),
      value: formatPercent(analytics.averageDifferenceFromLowestPercent, locale),
      hint: t('suppliers.intelligence.averageGapHint'),
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map(({ key, icon: Icon, label, value, hint }) => (
        <Card key={key}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                {hint ? <p className="text-muted-foreground mt-1 text-[11px] leading-4">{hint}</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
