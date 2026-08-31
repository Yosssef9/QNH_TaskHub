import { Archive, Pencil, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router'

import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractStatusBadge } from '@/features/contracts/components/ContractStatusBadge'
import { SupplierEditorDialog } from '@/features/contracts/components/SupplierEditorDialog'
import { displayDate } from '@/features/contracts/components/contract-display'
import {
  useArchiveSupplier,
  useContracts,
  useRestoreSupplier,
  useSupplier,
} from '@/features/contracts/hooks/use-contracts'
import { ApiClientError } from '@/lib/api-error'

export function SupplierDetailsPage() {
  const { i18n, t } = useTranslation()
  const params = useParams<{ supplierId: string }>()
  const supplierId = Number(params.supplierId)
  const supplierQuery = useSupplier(Number.isSafeInteger(supplierId) && supplierId > 0 ? supplierId : null)
  const contractsQuery = useContracts({
    search: '',
    page: 1,
    pageSize: 25,
    archived: false,
    supplierId,
    sortBy: 'endDate',
    sortDirection: 'asc',
  })
  const archiveMutation = useArchiveSupplier()
  const restoreMutation = useRestoreSupplier()
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  if (!Number.isSafeInteger(supplierId) || supplierId <= 0) return <Navigate to="/not-found" replace />
  if (supplierQuery.isPending) return <LoadingState />
  if (supplierQuery.isError || !supplierQuery.data)
    return <ErrorState onRetry={() => void supplierQuery.refetch()} />

  const supplier = supplierQuery.data
  const pending = archiveMutation.isPending || restoreMutation.isPending

  async function toggleArchive() {
    try {
      if (supplier.isActive) await archiveMutation.mutateAsync(supplier)
      else await restoreMutation.mutateAsync(supplier)
      toast.success(t(supplier.isActive ? 'contracts.suppliers.archived' : 'contracts.suppliers.restored'))
      setArchiveOpen(false)
    } catch (error) {
      const key =
        error instanceof ApiClientError && error.code === 'SUPPLIER_CHANGED'
          ? 'contracts.errors.changed'
          : error instanceof ApiClientError && error.code === 'SUPPLIER_NAME_EXISTS'
            ? 'contracts.suppliers.errors.duplicate'
            : 'contracts.suppliers.errors.save'
      toast.error(t(key))
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t('contracts.navigation.section'), path: '/contracts' },
          { label: t('contracts.navigation.suppliers'), path: '/contracts/suppliers' },
          { label: supplier.name },
        ]}
      />

      <PageHeader
        eyebrow={t('contracts.suppliers.detailsEyebrow')}
        title={supplier.name}
        description={t('contracts.suppliers.detailsDescription', {
          count: supplier.currentContractCount,
        })}
        actions={
          <>
            {supplier.isActive ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" className="size-4" />
                {t('common.edit')}
              </Button>
            ) : null}
            <Button
              variant={supplier.isActive ? 'outline' : 'default'}
              onClick={() => setArchiveOpen(true)}
            >
              {supplier.isActive ? (
                <Archive aria-hidden="true" className="size-4" />
              ) : (
                <RotateCcw aria-hidden="true" className="size-4" />
              )}
              {t(supplier.isActive ? 'contracts.archive' : 'contracts.restore')}
            </Button>
          </>
        }
      />

      {!supplier.isActive ? (
        <div className="bg-muted/60 rounded-xl border p-4 text-sm">
          {t('contracts.suppliers.archivedDescription')}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('contracts.suppliers.information')}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label={t('contracts.suppliers.commercialRegistrationNo')} value={supplier.commercialRegistrationNo} />
            <Info label={t('contracts.suppliers.taxNumber')} value={supplier.taxNumber} />
            <Info label={t('contracts.suppliers.address')} value={supplier.addressText} className="sm:col-span-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('contracts.suppliers.primaryContact')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Info label={t('contracts.suppliers.primaryContactName')} value={supplier.primaryContactName} />
            <Info label={t('contracts.suppliers.primaryContactEmail')} value={supplier.primaryContactEmail} />
            <Info label={t('contracts.suppliers.primaryContactPhone')} value={supplier.primaryContactPhone} />
          </CardContent>
        </Card>
      </div>

      {supplier.notes ? (
        <Card>
          <CardHeader><CardTitle>{t('contracts.notes')}</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm leading-6">{supplier.notes}</p></CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="font-semibold">{t('contracts.suppliers.relatedContracts')}</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('contracts.suppliers.contractsCountValue', { count: supplier.currentContractCount })}
            </p>
          </div>
          <Badge variant={supplier.expiringSoonContractCount > 0 ? 'warning' : 'secondary'}>
            {t('contracts.suppliers.expiringCount', { count: supplier.expiringSoonContractCount })}
          </Badge>
        </div>
        {contractsQuery.isPending ? (
          <LoadingState className="rounded-none border-0" />
        ) : contractsQuery.isError || !contractsQuery.data ? (
          <ErrorState className="rounded-none border-0" onRetry={() => void contractsQuery.refetch()} />
        ) : contractsQuery.data.items.length === 0 ? (
          <div className="text-muted-foreground p-8 text-center text-sm">
            {t('contracts.suppliers.noRelatedContracts')}
          </div>
        ) : (
          <div className="divide-y">
            {contractsQuery.data.items.map((contract) => (
              <Link
                key={contract.id}
                to={`/contracts/${contract.id}`}
                className="group hover:bg-primary/[0.035] focus-visible:ring-ring flex flex-col gap-2 p-4 outline-none focus-visible:ring-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="group-hover:text-primary font-medium">{contract.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {contract.endDate
                      ? `${t('contracts.endDate')}: ${displayDate(contract.endDate, i18n.language)}`
                      : t('contracts.noEndDate')}
                  </p>
                </div>
                <ContractStatusBadge state={contract.trackingState} daysRemaining={contract.daysRemaining} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <SupplierEditorDialog
        open={editOpen}
        supplier={supplier}
        onOpenChange={setEditOpen}
      />
      <ConfirmModal
        open={archiveOpen}
        title={t(supplier.isActive ? 'contracts.suppliers.archiveTitle' : 'contracts.suppliers.restoreTitle')}
        message={t(
          supplier.isActive
            ? 'contracts.suppliers.archiveDescription'
            : 'contracts.suppliers.restoreDescription',
          { count: supplier.currentContractCount },
        )}
        confirmText={t(supplier.isActive ? 'contracts.archive' : 'contracts.restore')}
        cancelText={t('common.cancel')}
        danger={supplier.isActive}
        loading={pending}
        onConfirm={() => void toggleArchive()}
        onCancel={() => setArchiveOpen(false)}
      />
    </div>
  )
}

function Info({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{value || '—'}</p>
    </div>
  )
}
