import { Activity, Clock3, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatDateOnly, formatUnitCost } from '@/features/items/components/item-price-format'
import { usePriceQuoteActivity, usePriceQuotes } from '../hooks/use-price-quotes'
import type { PriceQuote } from '../types/price-quote.types'

export function PriceQuoteHistoryDialog({
  open,
  quote,
  onOpenChange,
}: {
  open: boolean
  quote: PriceQuote
  onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const history = usePriceQuotes({
    itemId: quote.itemId,
    supplierId: quote.supplierId,
    period: 'ALL',
    status: 'ALL',
    page: 1,
    pageSize: 100,
    sortBy: 'quoteDate',
    sortDirection: 'desc',
  })
  const activity = usePriceQuoteActivity(quote.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" closeLabel={t('common.close')} className="w-[min(58rem,calc(100vw-2rem))]">
        <div className="flex items-start gap-3 pe-10">
          <div className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl"><Clock3 className="size-5" /></div>
          <div>
            <DialogTitle>{t('priceQuotes.historyTitle')}</DialogTitle>
            <DialogDescription className="mt-1">{`${quote.itemName} · ${quote.supplierName}`}</DialogDescription>
          </div>
        </div>

        {history.isPending ? <LoadingState className="mt-5" /> : history.isError || !history.data ? <ErrorState className="mt-5" onRetry={() => void history.refetch()} /> : (
          <div className="mt-5 max-h-[66vh] space-y-5 overflow-y-auto pe-1">
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Tags className="size-4" />{t('priceQuotes.pairHistory')}</h3>
              <div className="mt-3 overflow-x-auto rounded-xl border">
                <table className="min-w-[42rem] w-full text-sm">
                  <thead><tr className="bg-accent">
                    <th className="px-4 py-3 text-start text-xs font-semibold">{t('priceQuotes.quoteDate')}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold">{t('priceQuotes.quotedUnitCost')}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold">{t('priceQuotes.quoteNumber')}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold">{t('priceQuotes.status')}</th>
                  </tr></thead>
                  <tbody>{history.data.items.map((entry) => (
                    <tr key={entry.id} className="border-t">
                      <td className="px-4 py-3">{formatDateOnly(entry.quoteDate, locale)}</td>
                      <td dir="ltr" className="px-4 py-3 font-semibold tabular-nums">{formatUnitCost(entry.quotedUnitCost, locale, entry.currencyCode, entry.unitName)}</td>
                      <td dir="ltr" className="px-4 py-3">{entry.quoteNumber ?? '—'}</td>
                      <td className="px-4 py-3"><Badge variant={entry.isActive ? 'success' : 'secondary'}>{t(entry.isActive ? 'priceQuotes.active' : 'priceQuotes.inactive')}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4" />{t('priceQuotes.activity')}</h3>
              <div className="mt-3">
                {activity.isPending ? <LoadingState className="border-0 p-4" /> : activity.isError ? <ErrorState className="border-0" onRetry={() => void activity.refetch()} /> : (activity.data?.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('priceQuotes.noActivity')}</p>
                ) : <div className="space-y-2">{activity.data?.map((entry) => (
                  <div key={entry.id} className="bg-muted/35 rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t(`priceQuotes.activityTypes.${entry.type}`)}</p>
                      <time className="text-muted-foreground text-xs">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAtUtc))}</time>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{entry.actorName}</p>
                  </div>
                ))}</div>}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
