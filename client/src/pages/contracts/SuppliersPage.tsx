import { Building2, Plus, SearchX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { OverflowTooltipText } from '@/components/shared/OverflowTooltipText'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { TablePagination } from '@/components/shared/TablePagination'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SupplierEditorDialog } from '@/features/contracts/components/SupplierEditorDialog'
import { useSuppliers } from '@/features/contracts/hooks/use-contracts'

export function SuppliersPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [createOpen, setCreateOpen] = useState(false)
  const suppliers = useSuppliers({ search, page, pageSize, archived })
  const data = suppliers.data
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const startRow = data?.total ? (page - 1) * pageSize + 1 : 0
  const endRow = Math.min(page * pageSize, data?.total ?? 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('contracts.eyebrow')}
        title={t('contracts.suppliers.pageTitle')}
        description={t('contracts.suppliers.pageDescription')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {t('contracts.suppliers.create')}
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="bg-muted/35 inline-flex w-fit rounded-xl border p-1">
            <Button
              size="sm"
              variant={!archived ? 'default' : 'ghost'}
              onClick={() => {
                setArchived(false)
                setPage(1)
              }}
            >
              {t('contracts.currentRecords')}
            </Button>
            <Button
              size="sm"
              variant={archived ? 'default' : 'ghost'}
              onClick={() => {
                setArchived(true)
                setPage(1)
              }}
            >
              {t('contracts.archivedRecords')}
            </Button>
          </div>
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            className="lg:max-w-md"
            placeholder={t('contracts.suppliers.searchPlaceholder')}
            ariaLabel={t('contracts.suppliers.searchLabel')}
          />
        </div>

        {suppliers.isPending ? (
          <LoadingState className="rounded-none border-0" />
        ) : suppliers.isError || !data ? (
          <ErrorState className="rounded-none border-0" onRetry={() => void suppliers.refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={SearchX}
            title={t(archived ? 'contracts.suppliers.emptyArchived' : 'contracts.suppliers.emptyTitle')}
            description={t('contracts.suppliers.emptyDescription')}
          />
        ) : (
          <>
            <div className="hidden max-h-[68vh] overflow-auto md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="text-foreground/75 text-[11px] font-semibold tracking-wide">
                    <th className="border-primary/15 bg-primary/[0.065] border-b px-5 py-3.5 text-start">{t('contracts.suppliers.name')}</th>
                    <th className="border-primary/15 bg-primary/[0.065] border-b px-5 py-3.5 text-start">{t('contracts.suppliers.primaryContactName')}</th>
                    <th className="border-primary/15 bg-primary/[0.065] border-b px-5 py-3.5 text-start">{t('contracts.suppliers.contractsCount')}</th>
                    <th className="border-primary/15 bg-primary/[0.065] border-b px-5 py-3.5 text-start">{t('contracts.statusLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-primary/[0.035] focus-within:bg-primary/[0.035] border-b last:border-b-0">
                      <td className="px-5 py-4">
                        <Link
                          className="group hover:bg-primary/10 hover:text-primary focus-visible:ring-ring -ms-2 inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 font-semibold outline-none focus-visible:ring-2"
                          to={`/contracts/suppliers/${supplier.id}`}
                        >
                          <Building2 aria-hidden="true" className="text-primary size-3.5 shrink-0" />
                          <OverflowTooltipText className="max-w-full">{supplier.name}</OverflowTooltipText>
                          <span aria-hidden="true" className="text-xs opacity-0 group-hover:opacity-100">›</span>
                        </Link>
                        {supplier.commercialRegistrationNo ? (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {t('contracts.suppliers.crShort')}: {supplier.commercialRegistrationNo}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <p>{supplier.primaryContactName ?? '—'}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {supplier.primaryContactEmail ?? supplier.primaryContactPhone ?? ''}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold">{supplier.currentContractCount}</span>
                        {supplier.expiringSoonContractCount > 0 ? (
                          <p className="text-warning-foreground mt-1 text-xs">
                            {t('contracts.suppliers.expiringCount', {
                              count: supplier.expiringSoonContractCount,
                            })}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={supplier.isActive ? 'success' : 'secondary'}>
                          {t(supplier.isActive ? 'contracts.recordActive' : 'contracts.recordArchived')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {data.items.map((supplier) => (
                <Link key={supplier.id} to={`/contracts/suppliers/${supplier.id}`} className="hover:bg-primary/[0.035] focus-visible:ring-ring block p-4 outline-none focus-visible:ring-2">
                  <div className="flex items-start gap-3">
                    <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
                      <Building2 aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{supplier.name}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t('contracts.suppliers.contractsCountValue', { count: supplier.currentContractCount })}
                      </p>
                    </div>
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
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </>
        )}
      </Card>

      <SupplierEditorDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

