import { PackageSearch, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { EmptyState } from '@/components/shared/EmptyState'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatDateOnly,
  formatPercent,
  formatProcurementNumber,
  formatUnitCost,
} from '@/features/items/components/item-price-format'
import type {
  SortDirection,
  SupplierItemPriceList,
  SupplierItemPriceSortBy,
} from '../types/supplier.types'

export function SupplierItemsPriceTable({
  supplierId,
  data,
  period,
  page,
  pageSize,
  sortColumn,
  sortDirection,
  onSort,
  onPageChange,
  onPageSizeChange,
}: {
  supplierId: number
  data: SupplierItemPriceList
  period: string
  page: number
  pageSize: number
  sortColumn: SupplierItemPriceSortBy | null
  sortDirection: SortDirection
  onSort: (column: SupplierItemPriceSortBy) => void
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
        <CardTitle className="flex items-center gap-2">
          <PackageSearch aria-hidden="true" className="size-4" />
          {t('suppliers.intelligence.itemsAndPrices')}
        </CardTitle>
        <p className="text-muted-foreground text-sm">{t('suppliers.intelligence.itemsAndPricesDescription')}</p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {data.items.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={PackageSearch}
            title={t('suppliers.intelligence.noItemsTitle')}
            description={t('suppliers.intelligence.noItemsDescription')}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[68rem] w-full text-sm">
                <thead>
                  <tr>
                    <SortableHeader label={t('suppliers.intelligence.item')} column="item" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('suppliers.intelligence.latest')} column="latest" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-start text-xs font-semibold">{t('suppliers.intelligence.currentLowest')}</th>
                    <SortableHeader label={t('suppliers.intelligence.difference')} column="difference" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('suppliers.intelligence.lowestHistorical')} column="lowest" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('suppliers.intelligence.highestHistorical')} column="highest" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('suppliers.intelligence.average')} column="average" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('suppliers.intelligence.transactions')} column="transactions" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('suppliers.intelligence.lastPurchase')} column="lastPurchase" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const detailsPath = `/items/${item.itemId}?supplier=${supplierId}&period=${period}`
                    return (
                      <tr key={item.itemId} className="hover:bg-primary/[0.035] border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <TableEntityLink kind="item" id={item.itemId} name={item.itemName} code={item.itemCode} to={detailsPath} className="max-w-[22rem]" />
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {item.categoryName ? <span className="text-muted-foreground text-xs">{item.categoryName}</span> : null}
                            {item.isCurrentLowest ? <Badge variant="success"><Trophy aria-hidden="true" className="me-1 size-3" />{t('suppliers.intelligence.cheapest')}</Badge> : null}
                            {item.isCurrentHighest && !item.isCurrentLowest ? <Badge variant="warning">{t('suppliers.intelligence.highest')}</Badge> : null}
                            {item.marketSupplierCount === 1 ? <Badge variant="secondary">{t('suppliers.intelligence.onlySupplier')}</Badge> : null}
                          </div>
                        </td>
                        <td dir="ltr" className="px-4 py-3 font-semibold tabular-nums">{formatUnitCost(item.latestUnitCost, locale, item.currencyCode, item.unitName)}</td>
                        <td dir="ltr" className="px-4 py-3 tabular-nums">{formatUnitCost(item.currentLowestUnitCost, locale, item.currencyCode, item.unitName)}</td>
                        <td className="px-4 py-3">
                          {item.marketSupplierCount > 1 ? (
                            <div>
                              <p dir="ltr" className={item.differenceFromLowestAmount === 0 ? 'text-success font-semibold' : 'font-medium'}>
                                {formatUnitCost(item.differenceFromLowestAmount, locale, item.currencyCode, item.unitName)}
                              </p>
                              <p dir="ltr" className="text-muted-foreground mt-0.5 text-xs">{formatPercent(item.differenceFromLowestPercent, locale)}</p>
                            </div>
                          ) : '—'}
                        </td>
                        <td dir="ltr" className="px-4 py-3 tabular-nums">{formatUnitCost(item.lowestUnitCost, locale, item.currencyCode, item.unitName)}</td>
                        <td dir="ltr" className="px-4 py-3 tabular-nums">{formatUnitCost(item.highestUnitCost, locale, item.currencyCode, item.unitName)}</td>
                        <td dir="ltr" className="px-4 py-3 tabular-nums">{formatUnitCost(item.averageUnitCost, locale, item.currencyCode, item.unitName)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatProcurementNumber(item.transactionCount, locale, 0)}</td>
                        <td className="px-4 py-3">{formatDateOnly(item.lastPurchaseDate, locale)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {data.items.map((item) => (
                <Link key={item.itemId} to={`/items/${item.itemId}?supplier=${supplierId}&period=${period}`} className="hover:bg-primary/[0.035] block p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{item.itemName}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{formatDateOnly(item.lastPurchaseDate, locale)}</p>
                    </div>
                    {item.isCurrentLowest ? <Badge variant="success">{t('suppliers.intelligence.cheapest')}</Badge> : item.marketSupplierCount === 1 ? <Badge variant="secondary">{t('suppliers.intelligence.onlySupplier')}</Badge> : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div><p className="text-muted-foreground">{t('suppliers.intelligence.latest')}</p><p dir="ltr" className="mt-1 font-semibold">{formatUnitCost(item.latestUnitCost, locale, item.currencyCode, item.unitName)}</p></div>
                    <div><p className="text-muted-foreground">{t('suppliers.intelligence.currentLowest')}</p><p dir="ltr" className="mt-1 font-semibold">{formatUnitCost(item.currentLowestUnitCost, locale, item.currencyCode, item.unitName)}</p></div>
                    <div><p className="text-muted-foreground">{t('suppliers.intelligence.difference')}</p><p dir="ltr" className="mt-1 font-semibold">{item.marketSupplierCount > 1 ? formatPercent(item.differenceFromLowestPercent, locale) : '—'}</p></div>
                    <div><p className="text-muted-foreground">{t('suppliers.intelligence.transactions')}</p><p className="mt-1 font-semibold">{formatProcurementNumber(item.transactionCount, locale, 0)}</p></div>
                  </div>
                </Link>
              ))}
            </div>

            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              startRow={startRow}
              endRow={endRow}
              totalRows={data.total}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

