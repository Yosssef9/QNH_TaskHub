import { Building2, PackageSearch } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import type { SearchableSelectOption } from '@/components/shared/SearchableMultiSelect'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PriceQuoteScopePanel } from '@/features/price-quotes/components/PriceQuoteScopePanel'
import { useSortState } from '@/hooks/use-sort-state'
import {
  useItemAnalytics,
  useItemPriceHistory,
  useItemTransactions,
} from '../hooks/use-items'
import type {
  ItemListItem,
  ItemTransactionSortBy,
  ProcurementPricePeriod,
} from '../types/item.types'
import { ItemPriceHistoryChart } from './ItemPriceHistoryChart'
import { ItemPriceSummaryCards } from './ItemPriceSummaryCards'
import { ItemTransactionsTable } from './ItemTransactionsTable'

export function SupplierPriceDetailDrawer({
  open,
  item,
  supplier,
  period,
  onOpenChange,
}: {
  open: boolean
  item: ItemListItem
  supplier: SearchableSelectOption
  period: ProcurementPricePeriod
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const supplierId = Number(supplier.value)
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactionPageSize, setTransactionPageSize] = useState(10)
  const transactionSort = useSortState<ItemTransactionSortBy>('transactionDate', 'desc')
  const filter = useMemo(() => ({ period, supplierIds: [supplierId] }), [period, supplierId])

  const analytics = useItemAnalytics(open ? item.id : null, filter)
  const history = useItemPriceHistory(open ? item.id : null, { ...filter, maxPoints: 1000 })
  const transactions = useItemTransactions(open ? item.id : null, {
    ...filter,
    page: transactionPage,
    pageSize: transactionPageSize,
    sortBy: transactionSort.sortColumn ?? 'transactionDate',
    sortDirection: transactionSort.sortDirection,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="drawer"
        closeLabel={t('common.close')}
        className="w-screen border-e-0"
      >
        <div className="space-y-5 p-5 pe-14 sm:p-6 sm:pe-16">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
              <PackageSearch className="size-4" />
              <span>{item.name}</span>
              <span className="text-muted-foreground">×</span>
              <Building2 className="size-4" />
              <span>{supplier.label}</span>
            </div>
            <DialogTitle className="mt-2 text-xl">{t('items.matrix.drawerTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm">
              {t('items.matrix.drawerDescription', { period: t(`savedViews.periods.${period}`) })}
            </DialogDescription>
            <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span dir="ltr" className="font-mono">{item.code}</span>
              {supplier.description ? <span dir="ltr" className="font-mono">{supplier.description}</span> : null}
            </div>
          </div>

          {analytics.isPending ? <LoadingState /> : analytics.isError || !analytics.data ? (
            <ErrorState onRetry={() => void analytics.refetch()} />
          ) : (
            <ItemPriceSummaryCards analytics={analytics.data} />
          )}

          {history.isPending ? <LoadingState /> : history.isError || !history.data ? (
            <ErrorState onRetry={() => void history.refetch()} />
          ) : (
            <ItemPriceHistoryChart history={history.data} />
          )}

          <PriceQuoteScopePanel
            item={{ id: item.id, name: item.name, unit: item.unit }}
            supplier={{ id: supplierId, name: supplier.label }}
            period={period}
          />

          {transactions.isPending ? <LoadingState /> : transactions.isError || !transactions.data ? (
            <ErrorState onRetry={() => void transactions.refetch()} />
          ) : (
            <ItemTransactionsTable
              data={transactions.data}
              page={transactionPage}
              pageSize={transactionPageSize}
              sortColumn={transactionSort.sortColumn}
              sortDirection={transactionSort.sortDirection}
              onSort={(column) => { transactionSort.handleSort(column); setTransactionPage(1) }}
              onPageChange={setTransactionPage}
              onPageSizeChange={(value) => { setTransactionPageSize(value); setTransactionPage(1) }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
