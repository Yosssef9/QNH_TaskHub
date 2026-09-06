import { Building2, PackageSearch, Plus, ReceiptText, SearchX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { OverflowTooltipText } from '@/components/shared/OverflowTooltipText'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { SortableHeader } from '@/components/shared/SortableHeader'
import { TablePagination } from '@/components/shared/TablePagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDateOnly } from '@/features/items/components/item-price-format'
import { SupplierEditorDialog } from '@/features/suppliers/components/SupplierEditorDialog'
import { SupplierSourceBadge } from '@/features/suppliers/components/SupplierSourceBadge'
import { useSuppliers } from '@/features/suppliers/hooks/use-suppliers'
import type { SupplierSortBy, SupplierSource } from '@/features/suppliers/types/supplier.types'
import { useSortState } from '@/hooks/use-sort-state'

export function SuppliersPage() {
  const { i18n, t } = useTranslation()
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<SupplierSource | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [createOpen, setCreateOpen] = useState(false)
  const sort = useSortState<SupplierSortBy>('name', 'asc')
  const suppliers = useSuppliers({
    search,
    page,
    pageSize,
    ...(source === 'ALL' ? {} : { source }),
    sortBy: sort.sortColumn ?? 'name',
    sortDirection: sort.sortDirection,
  })
  const data = suppliers.data
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const startRow = data?.total ? (page - 1) * pageSize + 1 : 0
  const endRow = Math.min(page * pageSize, data?.total ?? 0)

  function onSort(column: SupplierSortBy) {
    sort.handleSort(column)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('procurement.title')}
        title={t('suppliers.pageTitle')}
        description={t('suppliers.intelligence.pageDescription')}
        actions={<Button onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" className="size-4" />{t('suppliers.create')}</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-muted-foreground text-xs font-medium">{t('suppliers.intelligence.suppliersShown')}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{(data?.total ?? 0).toLocaleString()}</p></div><span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl"><Building2 className="size-5" /></span></div></Card>
        <Card className="p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-muted-foreground text-xs font-medium">{t('suppliers.intelligence.itemsOnPage')}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{(data?.items.reduce((sum, item) => sum + item.purchasedItemCount, 0) ?? 0).toLocaleString()}</p></div><span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl"><PackageSearch className="size-5" /></span></div></Card>
        <Card className="p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-muted-foreground text-xs font-medium">{t('suppliers.intelligence.transactionsOnPage')}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{(data?.items.reduce((sum, item) => sum + item.transactionCount, 0) ?? 0).toLocaleString()}</p></div><span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl"><ReceiptText className="size-5" /></span></div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} className="lg:max-w-md" placeholder={t('suppliers.searchPlaceholder')} ariaLabel={t('suppliers.searchLabel')} />
          <Select value={source} onValueChange={(value) => { setSource(value as SupplierSource | 'ALL'); setPage(1) }}>
            <SelectTrigger className="w-full lg:w-48" aria-label={t('suppliers.source')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('suppliers.sourceAll')}</SelectItem>
              <SelectItem value="ORACLE">{t('suppliers.sourceOracle')}</SelectItem>
              <SelectItem value="MANUAL">{t('suppliers.sourceManual')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {suppliers.isPending ? <LoadingState className="rounded-none border-0" /> : suppliers.isError || !data ? <ErrorState className="rounded-none border-0" onRetry={() => void suppliers.refetch()} /> : data.items.length === 0 ? (
          <EmptyState className="rounded-none border-0" icon={SearchX} title={t('suppliers.emptyTitle')} description={t('suppliers.emptyDescription')} />
        ) : <>
          <div className="hidden max-h-[68vh] overflow-auto md:block">
            <table className="min-w-[58rem] w-full text-sm">
              <thead className="sticky top-0 z-10"><tr>
                <SortableHeader label={t('suppliers.name')} column="name" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={onSort} tone="soft-primary" />
                <SortableHeader label={t('suppliers.intelligence.itemsPurchased')} column="purchasedItems" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={onSort} tone="soft-primary" />
                <SortableHeader label={t('suppliers.intelligence.transactions')} column="transactions" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={onSort} tone="soft-primary" />
                <SortableHeader label={t('suppliers.intelligence.lastPurchase')} column="lastPurchase" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={onSort} tone="soft-primary" />
                <SortableHeader label={t('suppliers.myContracts')} column="contracts" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={onSort} tone="soft-primary" />
                <th className="border-primary/20 bg-accent border-b-2 px-4 py-4 text-start text-xs font-semibold">{t('suppliers.source')}</th>
              </tr></thead>
              <tbody>{data.items.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-primary/[0.035] border-b last:border-b-0">
                  <td className="px-4 py-4">
                    <Link to={`/suppliers/${supplier.id}`} className="group hover:text-primary focus-visible:ring-ring inline-flex max-w-full items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-2">
                      <Building2 aria-hidden="true" className="text-primary size-4 shrink-0" />
                      <OverflowTooltipText className="max-w-[24rem]">{supplier.name}</OverflowTooltipText>
                    </Link>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-xs"><span dir="ltr" className="font-mono">{supplier.code}</span>{supplier.countryName ? <span>· {supplier.countryName}</span> : null}</div>
                  </td>
                  <td className="px-4 py-4 font-semibold tabular-nums">{supplier.purchasedItemCount.toLocaleString()}</td>
                  <td className="px-4 py-4 tabular-nums">{supplier.transactionCount.toLocaleString()}</td>
                  <td className="px-4 py-4">{formatDateOnly(supplier.lastPurchaseDate, i18n.language)}</td>
                  <td className="px-4 py-4"><span className="font-semibold">{supplier.currentContractCount}</span>{supplier.expiringSoonContractCount > 0 ? <p className="text-warning-foreground mt-1 text-xs">{t('suppliers.expiringCount', { count: supplier.expiringSoonContractCount })}</p> : null}</td>
                  <td className="px-4 py-4"><SupplierSourceBadge source={supplier.source} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">{data.items.map((supplier) => (
            <Link key={supplier.id} to={`/suppliers/${supplier.id}`} className="hover:bg-primary/[0.035] block p-4">
              <div className="flex items-start gap-3"><span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg"><Building2 className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate font-semibold">{supplier.name}</p><SupplierSourceBadge source={supplier.source} /></div><p dir="ltr" className="text-muted-foreground mt-1 text-xs">{supplier.code}</p><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="text-muted-foreground">{t('suppliers.intelligence.itemsShort')}</p><p className="mt-1 font-semibold">{supplier.purchasedItemCount}</p></div><div><p className="text-muted-foreground">{t('suppliers.intelligence.transactionsShort')}</p><p className="mt-1 font-semibold">{supplier.transactionCount}</p></div><div><p className="text-muted-foreground">{t('suppliers.intelligence.lastPurchaseShort')}</p><p className="mt-1 font-semibold">{formatDateOnly(supplier.lastPurchaseDate, i18n.language)}</p></div></div></div></div>
            </Link>
          ))}</div>
          <TablePagination page={page} totalPages={totalPages} pageSize={pageSize} startRow={startRow} endRow={endRow} totalRows={data.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
        </>}
      </Card>

      <SupplierEditorDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
