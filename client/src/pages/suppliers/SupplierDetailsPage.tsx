import { Activity, FileText, Info, Pencil, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router'

import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractStatusBadge } from '@/features/contracts/components/ContractStatusBadge'
import { PriceQuoteScopePanel } from '@/features/price-quotes/components/PriceQuoteScopePanel'
import { displayDate } from '@/features/contracts/components/contract-display'
import { useContracts } from '@/features/contracts/hooks/use-contracts'
import { SupplierEditorDialog } from '@/features/suppliers/components/SupplierEditorDialog'
import { SupplierIntelligenceCards } from '@/features/suppliers/components/SupplierIntelligenceCards'
import { SupplierItemsPriceTable } from '@/features/suppliers/components/SupplierItemsPriceTable'
import { SupplierSourceBadge } from '@/features/suppliers/components/SupplierSourceBadge'
import {
  useSupplier,
  useSupplierActivity,
  useSupplierItemPrices,
  useSupplierPriceAnalytics,
} from '@/features/suppliers/hooks/use-suppliers'
import type {
  ProcurementPricePeriod,
  SupplierItemPriceSortBy,
} from '@/features/suppliers/types/supplier.types'
import { useSortState } from '@/hooks/use-sort-state'

const PERIODS: ProcurementPricePeriod[] = ['1M', '3M', '6M', '1Y', 'ALL']

export function SupplierDetailsPage() {
  const { t, i18n } = useTranslation()
  const params = useParams()
  const rawId = Number(params.supplierId)
  const supplierId = Number.isSafeInteger(rawId) && rawId !== 0 ? rawId : null
  const supplierQuery = useSupplier(supplierId)
  const activityQuery = useSupplierActivity(supplierId)
  const [editOpen, setEditOpen] = useState(false)
  const [period, setPeriod] = useState<ProcurementPricePeriod>('1Y')
  const [itemPage, setItemPage] = useState(1)
  const [itemPageSize, setItemPageSize] = useState(25)
  const itemSort = useSortState<SupplierItemPriceSortBy>('difference', 'desc')
  const analytics = useSupplierPriceAnalytics(supplierId, period)
  const itemPrices = useSupplierItemPrices(supplierId, {
    period,
    page: itemPage,
    pageSize: itemPageSize,
    sortBy: itemSort.sortColumn ?? 'difference',
    sortDirection: itemSort.sortDirection,
  })
  const contracts = useContracts({
    search: '',
    page: 1,
    pageSize: 25,
    archived: false,
    ...(supplierId === null ? {} : { supplierId }),
    sortBy: 'endDate',
    sortDirection: 'asc',
  })

  if (supplierId === null) return <Navigate to="/suppliers" replace />
  if (supplierQuery.isPending) return <LoadingState />
  if (supplierQuery.isError || !supplierQuery.data) {
    return <ErrorState onRetry={() => void supplierQuery.refetch()} />
  }

  const supplier = supplierQuery.data

  function changePeriod(value: ProcurementPricePeriod) {
    setPeriod(value)
    setItemPage(1)
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t('procurement.title') },
          { label: t('suppliers.pageTitle'), path: '/suppliers' },
          { label: supplier.name },
        ]}
      />
      <PageHeader
        eyebrow={t('suppliers.codeValue', { code: supplier.code })}
        title={supplier.name}
        description={supplier.nameSecondary ?? t('suppliers.detailsDescription')}
        actions={
          <Button onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden="true" className="size-4" />
            {t('common.edit')}
          </Button>
        }
      />

      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <div>
          <p className="text-sm font-semibold">{t('suppliers.intelligence.periodTitle')}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('suppliers.intelligence.periodDescription')}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={period === value ? 'default' : 'outline'}
              onClick={() => changePeriod(value)}
            >
              {t(`savedViews.periods.${value}`)}
            </Button>
          ))}
        </div>
      </div>

      {analytics.isPending ? (
        <LoadingState />
      ) : analytics.isError || !analytics.data ? (
        <ErrorState onRetry={() => void analytics.refetch()} />
      ) : (
        <SupplierIntelligenceCards analytics={analytics.data} />
      )}

      <div className="bg-background/95 sticky top-3 z-20 flex flex-wrap gap-1.5 rounded-xl border p-2 shadow-sm backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            document.getElementById('items-prices')?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          <ShoppingCart aria-hidden="true" className="size-4" />
          {t('suppliers.intelligence.itemsAndPrices')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            document.getElementById('my-quotes')?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          {t('priceQuotes.myQuotes')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            document.getElementById('my-contracts')?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          <FileText aria-hidden="true" className="size-4" />
          {t('suppliers.myContracts')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth' })
          }
        >
          <Activity aria-hidden="true" className="size-4" />
          {t('suppliers.activity')}
        </Button>
      </div>

      <section id="items-prices" className="scroll-mt-24">
        {itemPrices.isPending ? (
          <LoadingState />
        ) : itemPrices.isError || !itemPrices.data ? (
          <ErrorState onRetry={() => void itemPrices.refetch()} />
        ) : (
          <SupplierItemsPriceTable
            supplierId={supplierId}
            data={itemPrices.data}
            period={period}
            page={itemPage}
            pageSize={itemPageSize}
            sortColumn={itemSort.sortColumn}
            sortDirection={itemSort.sortDirection}
            onSort={(column) => {
              itemSort.handleSort(column)
              setItemPage(1)
            }}
            onPageChange={setItemPage}
            onPageSizeChange={(value) => {
              setItemPageSize(value)
              setItemPage(1)
            }}
          />
        )}
      </section>

      <section id="my-quotes" className="scroll-mt-24">
        <PriceQuoteScopePanel
          supplier={{ id: supplier.id, name: supplier.name, currency: supplier.currency }}
          period={period}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info aria-hidden="true" className="size-4" />
              {t('suppliers.information')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <InfoField label={t('suppliers.code')} value={supplier.code} dir="ltr" />
            <div>
              <p className="text-muted-foreground text-xs font-medium">{t('suppliers.source')}</p>
              <div className="mt-1">
                <SupplierSourceBadge source={supplier.source} />
              </div>
            </div>
            <InfoField label={t('suppliers.manualFileNo')} value={supplier.manualFileNo} />
            <InfoField
              label={t('suppliers.taxRegistrationNo')}
              value={supplier.taxRegistrationNo}
              dir="ltr"
            />
            <InfoField label={t('suppliers.country')} value={supplier.countryName} />
            <InfoField label={t('suppliers.city')} value={supplier.cityName} />
            <InfoField label={t('suppliers.currency')} value={supplier.currency} dir="ltr" />
            <InfoField
              label={t('suppliers.contactJobTel')}
              value={supplier.contactJobTel}
              dir="ltr"
            />
            <InfoField label={t('suppliers.extensionNo')} value={supplier.extensionNo} dir="ltr" />
            <InfoField label={t('suppliers.mobileNo')} value={supplier.mobileNo} dir="ltr" />
            <InfoField label={t('suppliers.homePhone')} value={supplier.homePhone} dir="ltr" />
            <InfoField label={t('suppliers.email')} value={supplier.email} dir="ltr" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('suppliers.myContracts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t('suppliers.currentContracts')} value={supplier.currentContractCount} />
              <Stat
                label={t('suppliers.expiringSoon')}
                value={supplier.expiringSoonContractCount}
              />
            </div>
            <p className="text-muted-foreground mt-4 text-xs leading-5">
              {t('suppliers.privateContractsHint')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card id="my-contracts" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText aria-hidden="true" className="size-4" />
            {t('suppliers.myContracts')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {contracts.isPending ? (
            <LoadingState className="rounded-none border-0" />
          ) : contracts.isError || !contracts.data ? (
            <ErrorState
              className="rounded-none border-0"
              onRetry={() => void contracts.refetch()}
            />
          ) : contracts.data.items.length === 0 ? (
            <EmptyState
              className="rounded-none border-0"
              icon={FileText}
              title={t('suppliers.noContracts')}
              description={t('suppliers.noContractsDescription')}
            />
          ) : (
            <div className="divide-y">
              {contracts.data.items.map((contract) => (
                <Link
                  key={contract.id}
                  to={`/contracts/${contract.id}`}
                  className="hover:bg-primary/[0.035] flex items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{contract.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {contract.contractNumber ?? '—'} ·{' '}
                      {displayDate(contract.endDate, i18n.language)}
                    </p>
                  </div>
                  <ContractStatusBadge state={contract.trackingState} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="activity" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity aria-hidden="true" className="size-4" />
            {t('suppliers.activity')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityQuery.isPending ? (
            <LoadingState className="border-0 p-4" />
          ) : activityQuery.isError ? (
            <ErrorState className="border-0" onRetry={() => void activityQuery.refetch()} />
          ) : (activityQuery.data?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t('suppliers.noActivity')}</p>
          ) : (
            <div className="space-y-3">
              {activityQuery.data?.map((entry) => (
                <div key={entry.id} className="bg-muted/35 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{t(`suppliers.activityTypes.${entry.type}`)}</p>
                    <time className="text-muted-foreground text-xs">
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(entry.createdAtUtc))}
                    </time>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{entry.actorName}</p>
                  {entry.changes ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(entry.changes).map(([field, change]) => (
                        <div key={field} className="bg-background rounded-lg border p-2.5 text-xs">
                          <p className="font-medium">
                            {t(`suppliers.fields.${field}`, { defaultValue: field })}
                          </p>
                          <p className="text-muted-foreground mt-1 break-words">
                            {String(change.from ?? '—')} → {String(change.to ?? '—')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SupplierEditorDialog open={editOpen} supplier={supplier} onOpenChange={setEditOpen} />
    </div>
  )
}

function InfoField({
  label,
  value,
  dir,
}: {
  label: string
  value: string | null
  dir?: 'ltr' | 'rtl'
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p dir={dir} className="mt-1 text-sm font-medium break-words">
        {value || '—'}
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/45 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
