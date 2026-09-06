import { Building2, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/shared/EmptyState'
import { TableEntityLink } from '@/components/shared/TableEntityLink'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  ItemSupplierPriceList,
  ItemSupplierPriceSummary,
  ItemSupplierSortBy,
  SortDirection,
} from '../types/item.types'
import { formatDateOnly, formatProcurementNumber, formatUnitCost } from './item-price-format'

function FocusedMatrix({ suppliers }: { suppliers: ItemSupplierPriceSummary[] }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  if (suppliers.length < 2 || suppliers.length > 5) return null
  const scope = suppliers[0]
  const rows = [
    { key: 'latest', label: t('items.analytics.latestActual'), value: (supplier: ItemSupplierPriceSummary) => supplier.latestUnitCost },
    { key: 'previous', label: t('items.analytics.previousActual'), value: (supplier: ItemSupplierPriceSummary) => supplier.previousUnitCost },
    { key: 'lowest', label: t('items.analytics.lowestHistorical'), value: (supplier: ItemSupplierPriceSummary) => supplier.lowestUnitCost },
    { key: 'highest', label: t('items.analytics.highestHistorical'), value: (supplier: ItemSupplierPriceSummary) => supplier.highestUnitCost },
    { key: 'average', label: t('items.analytics.averageActual'), value: (supplier: ItemSupplierPriceSummary) => supplier.averageUnitCost },
  ] as const

  return (
    <div className="mb-5 overflow-x-auto rounded-xl border">
      <div className="bg-muted/35 border-b px-4 py-3">
        <p className="text-sm font-semibold">{t('items.analytics.focusedComparison')}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('items.analytics.focusedComparisonHint')}</p>
      </div>
      <table className="min-w-[40rem] w-full text-sm">
        <thead>
          <tr>
            <th className="bg-accent px-4 py-3 text-start text-xs font-semibold">{t('items.analytics.metric')}</th>
            {suppliers.map((supplier) => (
              <th key={supplier.supplierId} className="bg-accent px-4 py-3 text-start text-xs font-semibold">
                <TableEntityLink kind="supplier" id={supplier.supplierId} name={supplier.supplierName} code={supplier.supplierCode} compact className="max-w-[14rem]" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              <th className="px-4 py-3 text-start text-xs font-medium">{row.label}</th>
              {suppliers.map((supplier) => (
                <td key={supplier.supplierId} dir="ltr" className="px-4 py-3 font-medium tabular-nums">
                  {formatUnitCost(row.value(supplier), locale, scope.currencyCode, scope.unitName)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t">
            <th className="px-4 py-3 text-start text-xs font-medium">{t('items.analytics.transactionCount')}</th>
            {suppliers.map((supplier) => (
              <td key={supplier.supplierId} className="px-4 py-3 tabular-nums">{formatProcurementNumber(supplier.transactionCount, locale, 0)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function ItemSupplierComparisonTable({
  data,
  selectedSupplierCount,
  page,
  pageSize,
  sortColumn,
  sortDirection,
  onSort,
  onPageChange,
  onPageSizeChange,
}: {
  data: ItemSupplierPriceList
  selectedSupplierCount: number
  page: number
  pageSize: number
  sortColumn: ItemSupplierSortBy | null
  sortDirection: SortDirection
  onSort: (column: ItemSupplierSortBy) => void
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
          <Building2 aria-hidden="true" className="size-4" />
          {t('items.analytics.supplierComparison')}
        </CardTitle>
        <p className="text-muted-foreground text-sm">{t('items.analytics.supplierComparisonDescription')}</p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {selectedSupplierCount >= 2 && selectedSupplierCount <= 5 ? (
          <div className="px-5 sm:px-6">
            <FocusedMatrix suppliers={data.suppliers} />
          </div>
        ) : null}

        {data.suppliers.length === 0 ? (
          <EmptyState className="rounded-none border-0" icon={Building2} title={t('items.analytics.noSuppliersTitle')} description={t('items.analytics.noSuppliersDescription')} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[62rem] w-full text-sm">
                <thead>
                  <tr>
                    <SortableHeader label={t('items.analytics.supplier')} column="supplier" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.latest')} column="latest" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.lowest')} column="lowest" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.highest')} column="highest" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.average')} column="average" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.transactionCount')} column="transactions" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                    <SortableHeader label={t('items.analytics.lastPurchase')} column="lastPurchase" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} tone="soft-primary" />
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((supplier) => (
                    <tr key={supplier.supplierId} className="hover:bg-primary/[0.035] border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <TableEntityLink kind="supplier" id={supplier.supplierId} name={supplier.supplierName} code={supplier.supplierCode} className="max-w-[20rem]" />
                          {supplier.isCurrentLowest ? <Badge variant="success"><Trophy aria-hidden="true" className="me-1 size-3" />{t('items.analytics.currentLowest')}</Badge> : null}
                          {supplier.isCurrentHighest && !supplier.isCurrentLowest ? <Badge variant="warning">{t('items.analytics.currentHighest')}</Badge> : null}
                        </div>
                      </td>
                      <td dir="ltr" className="px-4 py-3 font-semibold tabular-nums">{formatUnitCost(supplier.latestUnitCost, locale, supplier.currencyCode, supplier.unitName)}</td>
                      <td dir="ltr" className="px-4 py-3 tabular-nums">{formatUnitCost(supplier.lowestUnitCost, locale, supplier.currencyCode, supplier.unitName)}</td>
                      <td dir="ltr" className="px-4 py-3 tabular-nums">{formatUnitCost(supplier.highestUnitCost, locale, supplier.currencyCode, supplier.unitName)}</td>
                      <td dir="ltr" className="px-4 py-3 tabular-nums">{formatUnitCost(supplier.averageUnitCost, locale, supplier.currencyCode, supplier.unitName)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatProcurementNumber(supplier.transactionCount, locale, 0)}</td>
                      <td className="px-4 py-3">{formatDateOnly(supplier.lastPurchaseDate, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {data.suppliers.map((supplier) => (
                <div key={supplier.supplierId} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{supplier.supplierName}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{formatDateOnly(supplier.lastPurchaseDate, locale)}</p>
                    </div>
                    {supplier.isCurrentLowest ? <Badge variant="success">{t('items.analytics.currentLowest')}</Badge> : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div><p className="text-muted-foreground">{t('items.analytics.latest')}</p><p dir="ltr" className="mt-1 font-semibold">{formatUnitCost(supplier.latestUnitCost, locale, supplier.currencyCode, supplier.unitName)}</p></div>
                    <div><p className="text-muted-foreground">{t('items.analytics.average')}</p><p dir="ltr" className="mt-1 font-semibold">{formatUnitCost(supplier.averageUnitCost, locale, supplier.currencyCode, supplier.unitName)}</p></div>
                    <div><p className="text-muted-foreground">{t('items.analytics.lowest')}</p><p dir="ltr" className="mt-1 font-semibold">{formatUnitCost(supplier.lowestUnitCost, locale, supplier.currencyCode, supplier.unitName)}</p></div>
                    <div><p className="text-muted-foreground">{t('items.analytics.highest')}</p><p dir="ltr" className="mt-1 font-semibold">{formatUnitCost(supplier.highestUnitCost, locale, supplier.currencyCode, supplier.unitName)}</p></div>
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

