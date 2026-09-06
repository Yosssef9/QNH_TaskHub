import { ReceiptText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  ItemTransactionList,
  ItemTransactionSortBy,
  SortDirection,
} from '../types/item.types'
import { formatDateOnly, formatProcurementNumber, formatUnitCost } from './item-price-format'

export function ItemTransactionsTable({
  data,
  page,
  pageSize,
  sortColumn,
  sortDirection,
  onSort,
  onPageChange,
  onPageSizeChange,
}: {
  data: ItemTransactionList
  page: number
  pageSize: number
  sortColumn: ItemTransactionSortBy | null
  sortDirection: SortDirection
  onSort: (column: ItemTransactionSortBy) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))
  const startRow = data.total ? (page - 1) * pageSize + 1 : 0
  const endRow = Math.min(page * pageSize, data.total)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ReceiptText aria-hidden="true" className="size-4" />{t('items.analytics.transactions')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('items.analytics.transactionsDescription')}</p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {data.transactions.length === 0 ? (
          <EmptyState className="rounded-none border-0" icon={ReceiptText} title={t('items.analytics.noTransactionsTitle')} description={t('items.analytics.noTransactionsDescription')} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[78rem] w-full text-sm">
                <thead>
                  <tr>
                    <SortableHeader label={t('items.analytics.deliveryDate')} column="transactionDate" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.supplier')} column="supplier" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.unitCost')} column="unitCost" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.quantity')} column="quantity" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.invoiceNo')} column="invoiceNo" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-start text-xs font-semibold">{t('items.analytics.vendorInvoiceNo')}</th>
                    <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-start text-xs font-semibold">{t('items.analytics.orderId')}</th>
                    <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-start text-xs font-semibold">{t('items.analytics.lotExpiry')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((transaction, index) => (
                    <tr key={`${transaction.transactionDate}-${transaction.invoiceNo ?? 'invoice'}-${transaction.supplierId}-${index}`} className="hover:bg-primary/[0.035] border-b last:border-b-0">
                      <td className="px-4 py-3">{formatDateOnly(transaction.transactionDate, locale)}</td>
                      <td className="px-4 py-3">
                        <TableEntityLink kind="supplier" id={transaction.supplierId} name={transaction.supplierName} code={transaction.supplierCode} compact />
                      </td>
                      <td dir="ltr" className="px-4 py-3 font-semibold tabular-nums">{formatUnitCost(transaction.unitCost, locale, transaction.currencyCode, transaction.unitName)}</td>
                      <td dir="ltr" className="px-4 py-3 tabular-nums">{formatProcurementNumber(transaction.quantity, locale)}</td>
                      <td dir="ltr" className="px-4 py-3">{transaction.invoiceNo ?? '—'}</td>
                      <td dir="ltr" className="px-4 py-3">{transaction.vendorInvoiceNo ?? '—'}</td>
                      <td dir="ltr" className="px-4 py-3">{transaction.orderId ?? '—'}</td>
                      <td className="px-4 py-3"><p dir="ltr">{transaction.lotNo ?? '—'}</p>{transaction.expiryDate ? <p className="text-muted-foreground mt-1 text-xs">{formatDateOnly(transaction.expiryDate, locale)}</p> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {data.transactions.map((transaction, index) => (
                <div key={`${transaction.transactionDate}-${transaction.invoiceNo ?? 'invoice'}-${transaction.supplierId}-${index}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{transaction.supplierName}</p><p className="text-muted-foreground mt-1 text-xs">{formatDateOnly(transaction.transactionDate, locale)}</p></div>
                    <p dir="ltr" className="font-semibold tabular-nums">{formatUnitCost(transaction.unitCost, locale, transaction.currencyCode, transaction.unitName)}</p>
                  </div>
                  <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-2 text-xs">
                    <p>{t('items.analytics.quantity')}: <span className="text-foreground">{formatProcurementNumber(transaction.quantity, locale)}</span></p>
                    <p>{t('items.analytics.invoiceNo')}: <span dir="ltr" className="text-foreground">{transaction.invoiceNo ?? '—'}</span></p>
                    <p>{t('items.analytics.orderId')}: <span dir="ltr" className="text-foreground">{transaction.orderId ?? '—'}</span></p>
                    <p>{t('items.analytics.lot')}: <span dir="ltr" className="text-foreground">{transaction.lotNo ?? '—'}</span></p>
                  </div>
                </div>
              ))}
            </div>
            <TablePagination page={page} totalPages={totalPages} pageSize={pageSize} startRow={startRow} endRow={endRow} totalRows={data.total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
